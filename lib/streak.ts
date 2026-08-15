import { Prisma, PrismaClient, SessionStatus, type Session, type User } from "@prisma/client";
import { localDateKey } from "@/lib/timezone";

type Client = PrismaClient | Prisma.TransactionClient;

// Returns the YYYY-MM-DD calendar date immediately before `dateKey`, via
// pure calendar-field arithmetic rather than subtracting 24 real hours.
// A local day isn't always 24 hours across a DST transition (23 or 25), so
// subtracting a Date's epoch millis by 86_400_000 and reformatting can land
// on the wrong local calendar date right around the transition; operating
// on the Y/M/D fields directly (via a UTC-anchored scratch Date, so this
// function itself never touches a real timezone offset) sidesteps that.
export function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const scratch = new Date(Date.UTC(year, month - 1, day));
  scratch.setUTCDate(scratch.getUTCDate() - 1);
  return scratch.toISOString().slice(0, 10);
}

// Computes the User.currentStreak value to persist when `session` is
// submitted. `session`'s day-of-record is its startedAt (per the existing
// one-session-per-local-day rule — see CLAUDE.md "Session rules"), not
// whatever the real time is when this function runs, so a session begun
// before midnight and submitted after still resolves to the day it began.
//
// Lazy by design: no background job walks history to expire stale streaks.
// Instead, each submission looks at just the single most recently submitted
// session (bounded query, not a full history scan) and compares its local
// day to "yesterday" relative to this submission's day. Today's own
// submission always counts for at least a 1-day streak; it only extends the
// prior value if that most recent submission was exactly the day before.
export async function computeNextStreak(
  client: Client,
  user: Pick<User, "id" | "timezone" | "currentStreak">,
  session: Pick<Session, "id" | "startedAt">,
): Promise<number> {
  const todayKey = localDateKey(session.startedAt, user.timezone);
  const yesterdayKey = previousDateKey(todayKey);

  const priorSubmission = await client.session.findFirst({
    where: {
      userId: user.id,
      status: SessionStatus.SUBMITTED,
      id: { not: session.id },
    },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });

  const priorDayKey = priorSubmission
    ? localDateKey(priorSubmission.startedAt, user.timezone)
    : null;

  return priorDayKey === yesterdayKey ? user.currentStreak + 1 : 1;
}
