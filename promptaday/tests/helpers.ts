import { prisma } from "@/lib/prisma";
import { SessionStatus, SourceType } from "@prisma/client";

export { prisma };

const SEED_CATEGORY_NAMES = ["current events", "philosophy", "personal life"];

// The canonical per-test cleanup. All test files share one real Postgres
// database (no per-file isolation), so this has to undo everything a test
// might create beyond the base seed: sessions/entries/history/users, any
// Question rows inserted by the news/AI generation jobs (seed data is
// exclusively sourceType CURATED, so filtering the other two source types
// cleanly isolates test-inserted rows), and any ad hoc Category a test
// created (e.g. an isolated single-question category for eligibility
// tests) — left in place, these confuse other tests that pick "any
// enabledByDefault category" with no explicit ordering.
export async function resetDb() {
  await prisma.userQuestionHistory.deleteMany();
  await prisma.entry.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.question.deleteMany({
    where: {
      OR: [
        { sourceType: { in: [SourceType.NEWS_DERIVED, SourceType.AI_GENERATED] } },
        { category: { name: { notIn: SEED_CATEGORY_NAMES } } },
      ],
    },
  });
  await prisma.category.deleteMany({
    where: { name: { notIn: SEED_CATEGORY_NAMES } },
  });
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
  // Explicit name filter (not just enabledByDefault) so this can never
  // resolve to an ad hoc category a different test file left behind.
  const category = await prisma.category.findFirstOrThrow({
    where: { enabledByDefault: true, name: { in: SEED_CATEGORY_NAMES } },
    orderBy: { name: "asc" },
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
