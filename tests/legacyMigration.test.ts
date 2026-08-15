import { beforeEach, describe, expect, it } from "vitest";
import { SessionStatus } from "@prisma/client";
import {
  LEGACY_DEFAULT_USER_EMAIL,
  LegacyUserNotFoundError,
  TargetUserNotFoundError,
  migrateLegacyUser,
} from "@/lib/legacyMigration";
import { createRawSession, prisma, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

async function createLegacyUser() {
  return prisma.user.create({
    data: {
      id: "legacy_default_user",
      email: LEGACY_DEFAULT_USER_EMAIL,
      timezone: "America/New_York",
      prepDurationMinutes: 20,
      currentStreak: 7,
    },
  });
}

describe("migrateLegacyUser", () => {
  it("reassigns sessions, entries, and question history, and carries over settings/streak", async () => {
    const legacy = await createLegacyUser();
    const target = await prisma.user.create({
      data: { id: "user_real_clerk_id", email: "real@example.com", timezone: "America/New_York" },
    });

    const session = await createRawSession({
      userId: legacy.id,
      status: SessionStatus.SUBMITTED,
    });
    await prisma.entry.create({
      data: { sessionId: session.id, userId: legacy.id, content: { type: "doc", content: [] } },
    });
    const { category, question } = await (async () => {
      const c = await prisma.category.findFirstOrThrow();
      const q = await prisma.question.findFirstOrThrow({ where: { categoryId: c.id } });
      return { category: c, question: q };
    })();
    await prisma.userQuestionHistory.create({
      data: { userId: legacy.id, questionId: question.id },
    });

    const result = await migrateLegacyUser(prisma, "real@example.com");

    expect(result.sessionsReassigned).toBe(1);
    expect(result.entriesReassigned).toBe(1);
    expect(result.questionHistoryReassigned).toBe(1);
    expect(result.streakCarriedOver).toBe(7);
    expect(result.prepDurationMinutesCarriedOver).toBe(20);

    const movedSession = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(movedSession.userId).toBe(target.id);

    const movedEntry = await prisma.entry.findUniqueOrThrow({ where: { sessionId: session.id } });
    expect(movedEntry.userId).toBe(target.id);

    const history = await prisma.userQuestionHistory.findMany({ where: { userId: target.id } });
    expect(history).toHaveLength(1);

    const updatedTarget = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updatedTarget.currentStreak).toBe(7);
    expect(updatedTarget.prepDurationMinutes).toBe(20);

    const legacyStillThere = await prisma.user.findUnique({ where: { id: legacy.id } });
    expect(legacyStillThere).toBeNull();

    void category; // fixture setup only; not asserted on directly
  });

  it("throws LegacyUserNotFoundError if there's no pre-Clerk default user", async () => {
    await prisma.user.create({
      data: { id: "user_real_clerk_id", email: "real@example.com", timezone: "America/New_York" },
    });

    await expect(migrateLegacyUser(prisma, "real@example.com")).rejects.toBeInstanceOf(
      LegacyUserNotFoundError,
    );
  });

  it("throws TargetUserNotFoundError if the target hasn't signed in via Clerk yet", async () => {
    await createLegacyUser();

    await expect(migrateLegacyUser(prisma, "not-signed-in-yet@example.com")).rejects.toBeInstanceOf(
      TargetUserNotFoundError,
    );
  });
});
