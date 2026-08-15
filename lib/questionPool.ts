import { Prisma, PrismaClient, QuestionStatus } from "@prisma/client";

export class NoCategoriesAvailableError extends Error {
  constructor() {
    super("No enabled categories available");
  }
}

export class NoQuestionsAvailableError extends Error {
  constructor() {
    super("No approved questions available for this category");
  }
}

type Client = PrismaClient | Prisma.TransactionClient;

export async function pickCategory(client: Client, excludeCategoryId?: string) {
  const categories = await client.category.findMany({
    where: { enabledByDefault: true },
  });
  if (categories.length === 0) throw new NoCategoriesAvailableError();

  const pool =
    excludeCategoryId && categories.length > 1
      ? categories.filter((c) => c.id !== excludeCategoryId)
      : categories;

  return pool[Math.floor(Math.random() * pool.length)];
}

// Prefers a question in `categoryId` the user hasn't seen before (per
// UserQuestionHistory), falling back to the full approved pool once a
// category's questions have all been shown — with a 10-question seed pool
// this happens after ~10 uses, and refusing to serve anything would break
// the "one prompt per day" flow for a long-running user.
export async function pickQuestion(
  client: Client,
  userId: string,
  categoryId: string,
  excludeQuestionId?: string,
) {
  const seen = await client.userQuestionHistory.findMany({
    where: { userId },
    select: { questionId: true },
  });
  const seenIds = seen.map((h) => h.questionId);
  const excludeIds = excludeQuestionId ? [...seenIds, excludeQuestionId] : seenIds;

  let candidates = await client.question.findMany({
    where: { categoryId, status: QuestionStatus.APPROVED, id: { notIn: excludeIds } },
  });

  if (candidates.length === 0) {
    candidates = await client.question.findMany({
      where: {
        categoryId,
        status: QuestionStatus.APPROVED,
        ...(excludeQuestionId ? { id: { not: excludeQuestionId } } : {}),
      },
    });
  }

  if (candidates.length === 0) {
    candidates = await client.question.findMany({
      where: { categoryId, status: QuestionStatus.APPROVED },
    });
  }

  if (candidates.length === 0) throw new NoQuestionsAvailableError();

  return candidates[Math.floor(Math.random() * candidates.length)];
}
