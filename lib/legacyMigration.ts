import type { PrismaClient } from "@prisma/client";

export const LEGACY_DEFAULT_USER_EMAIL = "you@promptperday.local";

export class LegacyUserNotFoundError extends Error {
  constructor() {
    super(
      `No legacy user found (looked for email "${LEGACY_DEFAULT_USER_EMAIL}"). ` +
        "Either this has already been migrated, or there's nothing pre-Clerk to migrate.",
    );
  }
}

export class TargetUserNotFoundError extends Error {
  constructor(targetEmail: string) {
    super(
      `No User row exists yet for "${targetEmail}". Sign in once via Clerk with ` +
        "that email first (which lazily creates the row), then re-run this migration.",
    );
  }
}

export interface LegacyMigrationResult {
  legacyUserId: string;
  targetUserId: string;
  targetEmail: string;
  sessionsReassigned: number;
  entriesReassigned: number;
  questionHistoryReassigned: number;
  streakCarriedOver: number;
  prepDurationMinutesCarriedOver: number;
}

// One-time, human-triggered migration for the single pre-Clerk "default
// user" this app had through Phase 7 (see scripts/migrate-legacy-user.ts
// and CLAUDE.md's "Auth" section) — deliberately not something the app runs
// automatically on every new signup. "Adopt the old single-user data" only
// makes sense once, for the one real bootstrap account; running it
// automatically for every future signup would silently hand a stranger's
// account someone else's history.
//
// Looks the target user up by email (rather than requiring the caller to
// already know their raw Clerk user id) — after signing in once via Clerk,
// lib/currentUser.ts's getOrCreateUser() has already created their User row
// with their real email, so that's the only thing a human needs to supply.
export async function migrateLegacyUser(
  prisma: PrismaClient,
  targetEmail: string,
): Promise<LegacyMigrationResult> {
  const legacyUser = await prisma.user.findFirst({
    where: { email: LEGACY_DEFAULT_USER_EMAIL },
  });
  if (!legacyUser) {
    throw new LegacyUserNotFoundError();
  }

  const targetUser = await prisma.user.findUnique({ where: { email: targetEmail } });
  if (!targetUser) {
    throw new TargetUserNotFoundError(targetEmail);
  }

  const [sessionsReassigned, entriesReassigned, questionHistoryReassigned] =
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUser.id },
        data: {
          prepDurationMinutes: legacyUser.prepDurationMinutes,
          currentStreak: legacyUser.currentStreak,
        },
      });

      const sessions = await tx.session.updateMany({
        where: { userId: legacyUser.id },
        data: { userId: targetUser.id },
      });
      const entries = await tx.entry.updateMany({
        where: { userId: legacyUser.id },
        data: { userId: targetUser.id },
      });
      const history = await tx.userQuestionHistory.updateMany({
        where: { userId: legacyUser.id },
        data: { userId: targetUser.id },
      });

      await tx.user.delete({ where: { id: legacyUser.id } });

      return [sessions.count, entries.count, history.count];
    });

  return {
    legacyUserId: legacyUser.id,
    targetUserId: targetUser.id,
    targetEmail: targetUser.email,
    sessionsReassigned,
    entriesReassigned,
    questionHistoryReassigned,
    streakCarriedOver: legacyUser.currentStreak,
    prepDurationMinutesCarriedOver: legacyUser.prepDurationMinutes,
  };
}
