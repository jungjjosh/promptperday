import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const GRACE_SECONDS = 60;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await prisma.session.findUnique({ where: { id: params.id } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const deadline = session.graceUsed
    ? new Date(session.writeEndsAt.getTime() + GRACE_SECONDS * 1_000)
    : session.writeEndsAt;

  const now = new Date();
  if (now > deadline) {
    return NextResponse.json(
      { error: "Write phase deadline has passed" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (body?.content === undefined) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const entry = await prisma.entry.upsert({
    where: { sessionId: session.id },
    create: {
      sessionId: session.id,
      userId: session.userId,
      content: body.content,
    },
    update: {
      content: body.content,
    },
  });

  return NextResponse.json({
    id: entry.id,
    sessionId: entry.sessionId,
    content: entry.content,
  });
}
