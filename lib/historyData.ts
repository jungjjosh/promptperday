import { prisma } from "@/lib/prisma";
import { localDateKey } from "@/lib/timezone";
import { SessionStatus, type User } from "@prisma/client";
import type { HistoryEntry } from "@/lib/historyTypes";

export type { HistoryEntry } from "@/lib/historyTypes";

export async function getHistoryEntries(user: User): Promise<HistoryEntry[]> {
  const sessions = await prisma.session.findMany({
    where: { userId: user.id, status: SessionStatus.SUBMITTED },
    orderBy: { startedAt: "asc" },
    include: { category: true, entry: true },
  });

  return sessions
    .filter((s) => s.entry !== null)
    .map((s) => ({
      sessionId: s.id,
      entryId: s.entry!.id,
      dateKey: localDateKey(s.startedAt, user.timezone),
      categoryId: s.categoryId,
      categoryName: s.category.name,
      title: s.entry!.title,
      description: s.entry!.description,
      content: s.entry!.content,
      sources: s.entry!.sources,
      submittedAt: s.startedAt.toISOString(),
    }));
}
