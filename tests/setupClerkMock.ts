import { vi } from "vitest";
import { getMockClerkUserId } from "./clerkMock";

// Registered once via vitest.config.mts's `setupFiles`, before any test
// file's own imports run — this is what lets tests call route handlers
// directly (the established pattern in this suite — see CLAUDE.md's
// "Testing" section) while still exercising real auth()/currentUser()
// call sites, without a real Clerk project or network access. Official
// Clerk-recommended approach for testing code that calls
// @clerk/nextjs/server: mock the module.
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: getMockClerkUserId() })),
  currentUser: vi.fn(async () => {
    const id = getMockClerkUserId();
    if (!id) return null;
    const emailAddress = `${id}@example.test`;
    return {
      id,
      emailAddresses: [{ emailAddress }],
      primaryEmailAddress: { emailAddress },
    };
  }),
}));
