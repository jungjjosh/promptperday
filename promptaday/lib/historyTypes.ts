// Pure types shared between lib/historyData.ts (server) and history client
// components — same reasoning as lib/sessionTypes.ts.
export interface HistoryEntry {
  sessionId: string;
  entryId: string;
  dateKey: string; // YYYY-MM-DD in the user's stored timezone
  categoryId: string;
  categoryName: string;
  title: string | null;
  description: string | null;
  content: unknown; // TipTap JSON
  sources: string[];
  submittedAt: string;
}

export interface CategoryOption {
  id: string;
  name: string;
}
