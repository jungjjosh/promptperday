import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { SessionStatus, Visibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EMPTY_DOCUMENT } from "@/lib/richText";
import { computeNextStreak } from "@/lib/streak";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await prisma.session.findUnique({ where: { id: params.id } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Ownership check (Phase 8) — see grace/route.ts's comment.
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId || session.userId !== clerkUserId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status === SessionStatus.SUBMITTED) {
    return NextResponse.json(
      { error: "Session already submitted" },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" && body.title.trim() ? body.title : null;
  const description =
    typeof body?.description === "string" && body.description.trim()
      ? body.description
      : null;
  const sources = Array.isArray(body?.sources)
    ? body.sources.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  // Read outside the transaction to decide the new streak value — same
  // non-transactional-read posture as /start's already-submitted-today
  // check; the race window is between one account's own concurrent
  // requests (e.g. two tabs), not across accounts, since the ownership
  // check above already confirmed this session belongs to the caller (see
  // "/start and /reroll hardening" in CLAUDE.md for the same trade-off
  // elsewhere).
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const nextStreak = await computeNextStreak(prisma, user, session);

  // FOR_YOU is the only functional visibility in v1; any requested value is
  // ignored in favor of the default rather than rejected, since the UI never
  // offers another selectable option.
  const [entry] = await prisma.$transaction([
    prisma.entry.upsert({
      where: { sessionId: session.id },
      create: {
        sessionId: session.id,
        userId: session.userId,
        title,
        description,
        visibility: Visibility.FOR_YOU,
        sources,
        content: EMPTY_DOCUMENT,
      },
      update: {
        title,
        description,
        visibility: Visibility.FOR_YOU,
        sources,
      },
    }),
    prisma.session.update({
      where: { id: session.id },
      data: { status: SessionStatus.SUBMITTED },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { currentStreak: nextStreak },
    }),
  ]);

  return NextResponse.json({
    id: entry.id,
    sessionId: session.id,
    status: "submitted",
    currentStreak: nextStreak,
  });
}
