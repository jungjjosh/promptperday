// Pure types shared between server helpers (lib/todaySession.ts) and client
// components. No runtime imports here — client components must never pull
// in lib/prisma.ts (Prisma Client can't be bundled for the browser).
export interface ActiveSessionData {
  id: string;
  categoryId: string;
  categoryName: string;
  questionId: string;
  questionText: string;
  prepEndsAt: string;
  writeEndsAt: string;
  rerollUsed: boolean;
  graceUsed: boolean;
}

export type TodaySessionState =
  | { status: "idle" }
  | { status: "submitted" }
  | { status: "active"; session: ActiveSessionData };
