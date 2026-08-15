// Plain state module, deliberately with no `vi.mock` call in it — the mock
// registration itself lives in tests/setupClerkMock.ts (wired up via
// vitest.config.mts's `setupFiles`, which runs before any test file's own
// imports), so it's guaranteed to be registered before route handlers
// (which import @clerk/nextjs/server) get imported. A `vi.mock` call
// living in a regular imported module has no such guarantee.
let currentUserId: string | null = null;

export function setMockClerkUserId(id: string | null) {
  currentUserId = id;
}

export function getMockClerkUserId(): string | null {
  return currentUserId;
}
