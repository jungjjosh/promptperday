import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SessionStatus } from "@prisma/client";
import { POST as startSession } from "@/app/api/sessions/start/route";
import { POST as rerollSession } from "@/app/api/sessions/[id]/reroll/route";
import { POST as graceSession } from "@/app/api/sessions/[id]/grace/route";
import { PATCH as patchContent } from "@/app/api/sessions/[id]/content/route";
import { POST as submitSession } from "@/app/api/sessions/[id]/submit/route";
import { DELETE as deleteEntry } from "@/app/api/sessions/[id]/entry/route";
import { PATCH as patchUser } from "@/app/api/users/[id]/route";
import { getHistoryEntries } from "@/lib/historyData";
import { setMockClerkUserId } from "./clerkMock";
import { createRawSession, createTestUser, prisma, resetDb } from "./helpers";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  setMockClerkUserId(null);
});

// Phase 8's core requirement: two separately-authenticated accounts must
// never see or touch each other's data. Every case here creates data as
// account A, then mocks the Clerk session as account B and confirms B is
// refused — proving the ownership checks added to each route, not just
// that the happy path works for a single account (which the other test
// files already cover).
describe("cross-account data isolation", () => {
  it("history: user B's query never returns user A's entries", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    const session = await createRawSession({
      userId: userA.id,
      status: SessionStatus.SUBMITTED,
    });
    await prisma.entry.create({
      data: {
        sessionId: session.id,
        userId: userA.id,
        content: { type: "doc", content: [] },
      },
    });

    const entriesForA = await getHistoryEntries(userA);
    const entriesForB = await getHistoryEntries(userB);

    expect(entriesForA).toHaveLength(1);
    expect(entriesForB).toHaveLength(0);
  });

  it("streak: user B's currentStreak is unaffected by user A's submissions", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    const session = await createRawSession({ userId: userA.id });
    setMockClerkUserId(userA.id);
    const res = await submitSession(
      jsonRequest(`http://localhost/api/sessions/${session.id}/submit`, "POST", {}),
      { params: { id: session.id } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).currentStreak).toBe(1);

    const storedA = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    const storedB = await prisma.user.findUniqueOrThrow({ where: { id: userB.id } });
    expect(storedA.currentStreak).toBe(1);
    expect(storedB.currentStreak).toBe(0);
  });

  it("reroll: user B gets 404 on user A's session, and it's left untouched", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const session = await createRawSession({ userId: userA.id });

    setMockClerkUserId(userB.id);
    const res = await rerollSession(
      jsonRequest(`http://localhost/api/sessions/${session.id}/reroll`, "POST", {
        type: "question",
      }),
      { params: { id: session.id } },
    );
    expect(res.status).toBe(404);

    const stillUnrerolled = await prisma.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stillUnrerolled.rerollUsed).toBe(false);
  });

  it("grace: user B gets 404 on user A's session, and grace is left unused", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const session = await createRawSession({
      userId: userA.id,
      writeEndsAt: new Date(Date.now() + 60_000),
    });

    setMockClerkUserId(userB.id);
    const res = await graceSession(
      jsonRequest(`http://localhost/api/sessions/${session.id}/grace`, "POST"),
      { params: { id: session.id } },
    );
    expect(res.status).toBe(404);

    const stillUnused = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(stillUnused.graceUsed).toBe(false);
  });

  it("content: user B can't PATCH content onto user A's session", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const session = await createRawSession({
      userId: userA.id,
      writeEndsAt: new Date(Date.now() + 60_000),
    });

    setMockClerkUserId(userB.id);
    const res = await patchContent(
      jsonRequest(`http://localhost/api/sessions/${session.id}/content`, "PATCH", {
        content: { text: "user B's tampering attempt" },
      }),
      { params: { id: session.id } },
    );
    expect(res.status).toBe(404);

    const entry = await prisma.entry.findUnique({ where: { sessionId: session.id } });
    expect(entry).toBeNull();
  });

  it("submit: user B can't submit user A's session", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const session = await createRawSession({ userId: userA.id });

    setMockClerkUserId(userB.id);
    const res = await submitSession(
      jsonRequest(`http://localhost/api/sessions/${session.id}/submit`, "POST", {}),
      { params: { id: session.id } },
    );
    expect(res.status).toBe(404);

    const stillPrepping = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(stillPrepping.status).toBe(SessionStatus.PREPPING);
  });

  it("entry delete: user B can't delete user A's entry", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const session = await createRawSession({ userId: userA.id });
    await prisma.entry.create({
      data: { sessionId: session.id, userId: userA.id, content: { type: "doc", content: [] } },
    });

    setMockClerkUserId(userB.id);
    const res = await deleteEntry(
      jsonRequest(`http://localhost/api/sessions/${session.id}/entry`, "DELETE"),
      { params: { id: session.id } },
    );
    expect(res.status).toBe(404);

    const stillThere = await prisma.entry.findUnique({ where: { sessionId: session.id } });
    expect(stillThere).not.toBeNull();
  });

  it("settings: user B can't PATCH user A's prepDurationMinutes", async () => {
    const userA = await createTestUser({ prepDurationMinutes: 10 });
    const userB = await createTestUser();

    setMockClerkUserId(userB.id);
    const res = await patchUser(
      jsonRequest(`http://localhost/api/users/${userA.id}`, "PATCH", {
        prepDurationMinutes: 20,
      }),
      { params: { id: userA.id } },
    );
    expect(res.status).toBe(404);

    const stillTen = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    expect(stillTen.prepDurationMinutes).toBe(10);
  });

  it("start: two accounts each get their own session on the same day, neither blocking the other", async () => {
    const userA = await createTestUser({ timezone: "America/New_York" });
    const userB = await createTestUser({ timezone: "America/New_York" });

    setMockClerkUserId(userA.id);
    const resA = await startSession(
      jsonRequest("http://localhost/api/sessions/start", "POST"),
    );
    expect(resA.status).toBe(201);

    setMockClerkUserId(userB.id);
    const resB = await startSession(
      jsonRequest("http://localhost/api/sessions/start", "POST"),
    );
    expect(resB.status).toBe(201);

    const bodyA = await resA.json();
    const bodyB = await resB.json();
    expect(bodyA.id).not.toBe(bodyB.id);

    const sessionA = await prisma.session.findUniqueOrThrow({ where: { id: bodyA.id } });
    const sessionB = await prisma.session.findUniqueOrThrow({ where: { id: bodyB.id } });
    expect(sessionA.userId).toBe(userA.id);
    expect(sessionB.userId).toBe(userB.id);
  });
});
