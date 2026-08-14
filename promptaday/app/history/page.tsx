import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser } from "@/lib/currentUser";
import { getHistoryEntries } from "@/lib/historyData";
import HistoryView from "@/components/history/HistoryView";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getOrCreateDefaultUser();
  const [entries, categories] = await Promise.all([
    getHistoryEntries(user),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <HistoryView
      entries={entries}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      userTimezone={user.timezone}
    />
  );
}
