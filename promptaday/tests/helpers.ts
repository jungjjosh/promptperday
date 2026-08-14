import { prisma } from "@/lib/prisma";
import { SessionStatus } from "@prisma/client";

export { prisma };

export async function resetDb() {
  await prisma.userQuestionHistory.deleteMany();
  await prisma.entry.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

let userCounter = 0;

export async function createTestUser(
  overrides: Partial<{
    email: string;
    timezone: string;
    prepDurationMinutes: number;
  }> = {},
) {
  userCounter += 1;
  return prisma.user.create({
    data: {
      email: overrides.email ?? `test-user-${userCounter}@example.com`,
      timezone: overrides.timezone ?? "America/New_York",
      prepDurationMinutes: overrides.prepDurationMinutes ?? 10,
    },
  });
}

export async function seededCategoryAndQuestion() {
  const category = await prisma.category.findFirstOrThrow({
    where: { enabledByDefault: true },
  });
  const question = await prisma.question.findFirstOrThrow({
    where: { categoryId: category.id },
  });
  return { category, question };
}

// Creates a Session row directly (bypassing the /start route) so tests can
// fabricate specific timer states — e.g. a session whose write phase has
// already ended — without waiting on real time.
export async function createRawSession(
  overrides: Partial<{
    userId: string;
    categoryId: string;
    questionId: string;
    startedAt: Date;
    prepEndsAt: Date;
    writeEndsAt: Date;
    rerollUsed: boolean;
    graceUsed: boolean;
    status: SessionStatus;
  }> = {},
) {
  const { category, question } = await seededCategoryAndQuestion();
  const user = overrides.userId
    ? { id: overrides.userId }
    : await createTestUser();

  const now = new Date();
  return prisma.session.create({
    data: {
      userId: overrides.userId ?? user.id,
      categoryId: overrides.categoryId ?? category.id,
      questionId: overrides.questionId ?? question.id,
      startedAt: overrides.startedAt ?? now,
      prepEndsAt: overrides.prepEndsAt ?? new Date(now.getTime() + 10 * 60_000),
      writeEndsAt: overrides.writeEndsAt ?? new Date(now.getTime() + 15 * 60_000),
      rerollUsed: overrides.rerollUsed ?? false,
      graceUsed: overrides.graceUsed ?? false,
      status: overrides.status ?? SessionStatus.PREPPING,
    },
  });
}
