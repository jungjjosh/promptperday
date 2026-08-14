import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { SessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/currentUser";
import { localDateKey } from "@/lib/timezone";
import {
  NoCategoriesAvailableError,
  NoQuestionsAvailableError,
  pickCategory,
  pickQuestion,
} from "@/lib/questionPool";

const WRITE_DURATION_MINUTES = 5;

// Phase 8: the acting user comes from the Clerk session, never from the
// request body — a client-supplied userId here was the whole point of the
// no-auth/single-shared-password eras' "every route trusts whatever userId
// is passed to it" trade-off (see CLAUDE.md's "Auth" section history),
// which stopped being acceptable the moment more than one real account
// could exist.
export async function POST(_request: NextRequest) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getOrCreateUser();
  const userId = user.id;

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
