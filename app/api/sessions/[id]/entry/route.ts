import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const entry = await prisma.entry.findUnique({ where: { sessionId: params.id } });
  if (!entry) {
    return NextResponse.json(
      { error: "No entry found for this session" },
      { status: 404 },
    );
  }

  // Ownership check (Phase 8) — Entry already carries its own userId, so no
  // extra Session lookup is needed for this one.
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId || entry.userId !== clerkUserId) {
    return NextResponse.json(
      { error: "No entry found for this session" },
      { status: 404 },
    );
  }

  await prisma.entry.delete({ where: { sessionId: params.id } });

  return NextResponse.json({ deleted: true });
}
