import { prisma } from "@/lib/prisma";

const DEFAULT_USER_EMAIL = "you@promptperday.local";

// No auth exists yet — v1 is single-user/local-only. Resolves to the first
// User row, creating one on first run so the app works without a signup
// flow. Replace with real auth before this serves more than one person.
export async function getOrCreateDefaultUser() {
  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      email: DEFAULT_USER_EMAIL,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
}
