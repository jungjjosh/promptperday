import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const GRACE_SECONDS = 60;

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await prisma.session.findUnique({ where: { id: params.id } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Ownership check (Phase 8): 404, not 403, for a session that exists but
  // belongs to someone else — same response as "doesn't exist" so this
  // route never confirms another account's session id is valid.
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId || session.userId !== clerkUserId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.graceUsed) {
    return NextResponse.json(
      { error: "Grace extension already used" },
      { status: 400 },
    );
  }

  const now = new Date();
  if (now > session.writeEndsAt) {
    return NextResponse.json(
      { error: "Write phase has already ended" },
      { status: 400 },
    );
  }

  const updated = await prisma.session.update({
    where: { id: session.id },
    data: { graceUsed: true },
  });

  const effectiveDeadline = new Date(
    updated.writeEndsAt.getTime() + GRACE_SECONDS * 1_000,
  );

  return NextResponse.json({
    id: updated.id,
    graceUsed: true,
    effectiveDeadline,
  });
}
