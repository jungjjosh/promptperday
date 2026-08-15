import { NextRequest, NextResponse } from "next/server";
import { QuestionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUSES: Record<string, QuestionStatus> = {
  approved: QuestionStatus.APPROVED,
  archived: QuestionStatus.ARCHIVED,
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const question = await prisma.question.findUnique({ where: { id: params.id } });
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const nextStatus = ALLOWED_STATUSES[body?.status];
  if (!nextStatus) {
    return NextResponse.json(
      { error: 'status must be "approved" or "archived"' },
      { status: 400 },
    );
  }

  const updated = await prisma.question.update({
    where: { id: question.id },
    data: { status: nextStatus },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
