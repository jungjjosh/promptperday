import { PrismaClient } from "@prisma/client";
import { migrateLegacyUser } from "../lib/legacyMigration";

// Run once, by hand, after signing in for the first time via Clerk with
// your real account:
//   npx tsx scripts/migrate-legacy-user.ts you@your-real-email.com
// See CLAUDE.md's "Auth" section for the full runbook.
async function main() {
  const targetEmail = process.argv[2];
  if (!targetEmail) {
    console.error("Usage: npx tsx scripts/migrate-legacy-user.ts <your-real-email>");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const result = await migrateLegacyUser(prisma, targetEmail);
    console.log(`Migrated legacy user ${result.legacyUserId} -> ${result.targetUserId} (${result.targetEmail})`);
    console.log(`  Sessions reassigned: ${result.sessionsReassigned}`);
    console.log(`  Entries reassigned: ${result.entriesReassigned}`);
    console.log(`  Question history rows reassigned: ${result.questionHistoryReassigned}`);
    console.log(`  Streak carried over: ${result.streakCarriedOver}`);
    console.log(`  Prep duration carried over: ${result.prepDurationMinutesCarriedOver} min`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
