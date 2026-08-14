import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_PREP_DURATIONS = [5, 10, 15, 20];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // Ownership check (Phase 8) — a user can only ever update their own
  // settings; :id is client-supplied (SettingsForm builds the URL from the
  // server-resolved current user's id, but nothing stops a request being
  // replayed with a different id), so it must match the authenticated
  // Clerk session, not just exist.
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId || clerkUserId !== params.id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (
    typeof body?.prepDurationMinutes !== "number" ||
    !ALLOWED_PREP_DURATIONS.includes(body.prepDurationMinutes)
  ) {
    return NextResponse.json(
      { error: "prepDurationMinutes must be one of 5, 10, 15, 20" },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { prepDurationMinutes: body.prepDurationMinutes },
  });

  return NextResponse.json({
    id: updated.id,
    prepDurationMinutes: updated.prepDurationMinutes,
  });
}
