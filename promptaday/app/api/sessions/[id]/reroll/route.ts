import { NextRequest, NextResponse } from "next/server";
import { SessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pickCategory, pickQuestion } from "@/lib/questionPool";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await request.json().catch(() => null);
  const type = body?.type;
  if (type !== "category" && type !== "question") {
    return NextResponse.json(
      { error: 'type must be "category" or "question"' },
      { status: 400 },
    );
  }

  const session = await prisma.session.findUnique({ where: { id: params.id } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status === SessionStatus.SUBMITTED) {
    return NextResponse.json(
      { error: "Session already submitted" },
      { status: 409 },
    );
  }
  if (session.rerollUsed) {
    return NextResponse.json(
      { error: "Reroll already used for this session" },
      { status: 400 },
    );
  }

  let category = { id: session.categoryId, name: "" };
  let question;

  if (type === "category") {
    const newCategory = await pickCategory(prisma, session.categoryId);
    question = await pickQuestion(prisma, session.userId, newCategory.id);
    category = newCategory;
  } else {
    question = await pickQuestion(
      prisma,
      session.userId,
      session.categoryId,
      session.questionId,
    );
    category = await prisma.category.findUniqueOrThrow({
      where: { id: session.categoryId },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: session.id },
      data: {
        categoryId: category.id,
        questionId: question.id,
        rerollUsed: true,
      },
    });
    await tx.userQuestionHistory.create({
      data: { userId: session.userId, questionId: question.id },
    });
  });

  return NextResponse.json({
    id: session.id,
    category: { id: category.id, name: category.name },
    question: { id: question.id, text: question.text },
    rerollUsed: true,
  });
}
