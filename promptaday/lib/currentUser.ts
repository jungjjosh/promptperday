import { auth, currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// Phase 8: replaces the single lazily-created default user with a real
// per-account row, keyed by Clerk's user id (User.id has no DB default as
// of this phase — see prisma/schema.prisma). Still lazy — there's no
// signup webhook; the first time a real Clerk-authenticated request
// reaches this function for a given account, that account's User row gets
// created. Throws if called outside an authenticated request, which
// shouldn't happen given every page/API route this is called from sits
// behind middleware.ts's Clerk protection — this is a defensive invariant,
// not a real code path.
export async function getOrCreateUser() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    throw new Error("getOrCreateUser called without an authenticated Clerk session");
  }

  const existing = await prisma.user.findUnique({ where: { id: clerkUserId } });
  if (existing) return existing;

  const clerkUser = await clerkCurrentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    `${clerkUserId}@no-email.clerk`;

  return prisma.user.create({
    data: {
      id: clerkUserId,
      email,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
}
