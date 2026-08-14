import { NextRequest, NextResponse } from "next/server";
import { SessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { localDateKey } from "@/lib/timezone";
import {
  NoCategoriesAvailableError,
  NoQuestionsAvailableError,
  pickCategory,
  pickQuestion,
} from "@/lib/questionPool";

const WRITE_DURATION_MINUTES = 5;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const now = new Date();
  const todayKey = localDateKey(now, user.timezone);

  const submittedToday = await prisma.session.findMany({
    where: { userId, status: SessionStatus.SUBMITTED },
    select: { startedAt: true },
  });
  const alreadySubmittedToday = submittedToday.some(
    (s) => localDateKey(s.startedAt, user.timezone) === todayKey,
  );
  if (alreadySubmittedToday) {
    return NextResponse.json(
      { error: "Already submitted a prompt today" },
      { status: 409 },
    );
  }

  let category, question;
  try {
    category = await pickCategory(prisma);
    question = await pickQuestion(prisma, userId, category.id);
  } catch (err) {
    if (err instanceof NoCategoriesAvailableError || err instanceof NoQuestionsAvailableError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const prepEndsAt = new Date(now.getTime() + user.prepDurationMinutes * 60_000);
  const writeEndsAt = new Date(prepEndsAt.getTime() + WRITE_DURATION_MINUTES * 60_000);

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.session.create({
      data: {
        userId,
        categoryId: category.id,
        questionId: question.id,
        startedAt: now,
        prepEndsAt,
        writeEndsAt,
      },
    });
    await tx.userQuestionHistory.create({
      data: { userId, questionId: question.id },
    });
    return created;
  });

  return NextResponse.json(
    {
      id: session.id,
      category: { id: category.id, name: category.name },
      question: { id: question.id, text: question.text },
      prepEndsAt: session.prepEndsAt,
      writeEndsAt: session.writeEndsAt,
    },
    { status: 201 },
  );
}
