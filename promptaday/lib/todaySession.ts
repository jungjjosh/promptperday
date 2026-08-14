import { prisma } from "@/lib/prisma";
import { localDateKey } from "@/lib/timezone";
import { SessionStatus, type User } from "@prisma/client";
import type { TodaySessionState } from "@/lib/sessionTypes";

export type { ActiveSessionData, TodaySessionState } from "@/lib/sessionTypes";

// Mirrors the day-boundary logic in POST /api/sessions/start (same
// localDateKey comparison) so the BEGIN tab can decide what to render on
// load — including after a reload, without a dedicated read endpoint.
export async function getTodaySessionState(user: User): Promise<TodaySessionState> {
  const todayKey = localDateKey(new Date(), user.timezone);

  const recentSessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    take: 5,
    include: { category: true, question: true },
  });

  const todaySession = recentSessions.find(
    (s) => localDateKey(s.startedAt, user.timezone) === todayKey,
  );

  if (!todaySession) return { status: "idle" };
  if (todaySession.status === SessionStatus.SUBMITTED) return { status: "submitted" };

  return {
    status: "active",
    session: {
      id: todaySession.id,
      categoryId: todaySession.categoryId,
      categoryName: todaySession.category.name,
      questionId: todaySession.questionId,
      questionText: todaySession.question.text,
      prepEndsAt: todaySession.prepEndsAt.toISOString(),
      writeEndsAt: todaySession.writeEndsAt.toISOString(),
      rerollUsed: todaySession.rerollUsed,
      graceUsed: todaySession.graceUsed,
    },
  };
}
