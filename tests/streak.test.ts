import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SessionStatus } from "@prisma/client";
import { POST as submitSession } from "@/app/api/sessions/[id]/submit/route";
import { computeNextStreak, previousDateKey } from "@/lib/streak";
import { setMockClerkUserId } from "./clerkMock";
import { createRawSession, createTestUser, prisma, resetDb } from "./helpers";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Submits `session` via the real route handler at a given (mocked) wall-clock
// time, so tests exercise the same logic the app itself uses rather than
// calling computeNextStreak directly.
async function submitAt(sessionId: string, now: Date) {
  vi.setSystemTime(now);
  const res = await submitSession(
    jsonRequest(`http://localhost/api/sessions/${sessionId}/submit`, "POST", {}),
    { params: { id: sessionId } },
  );
  return res;
}

const TZ = "America/New_York";

beforeEach(async () => {
  await resetDb();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  setMockClerkUserId(null);
});

describe("streak counting", () => {
  it("increments across normal consecutive local days", async () => {
    const user = await createTestUser({ timezone: TZ });
    setMockClerkUserId(user.id);

    const day1 = await createRawSession({
      userId: user.id,
      startedAt: new Date("2026-01-05T18:00:00-05:00"),
    });
    const res1 = await submitAt(day1.id, new Date("2026-01-05T18:05:00-05:00"));
    expect((await res1.json()).currentStreak).toBe(1);

    const day2 = await createRawSession({
      userId: user.id,
      startedAt: new Date("2026-01-06T18:00:00-05:00"),
    });
    const res2 = await submitAt(day2.id, new Date("2026-01-06T18:05:00-05:00"));
    expect((await res2.json()).currentStreak).toBe(2);

    const day3 = await createRawSession({
      userId: user.id,
      startedAt: new Date("2026-01-07T18:00:00-05:00"),
    });
    const res3 = await submitAt(day3.id, new Date("2026-01-07T18:05:00-05:00"));
    expect((await res3.json()).currentStreak).toBe(3);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.currentStreak).toBe(3);
  });

  it("resets to 1 (not a continued increment) after a missed day", async () => {
    const user = await createTestUser({ timezone: TZ });
    setMockClerkUserId(user.id);

    const day1 = await createRawSession({
      userId: user.id,
      startedAt: new Date("2026-01-05T18:00:00-05:00"),
    });
    await submitAt(day1.id, new Date("2026-01-05T18:05:00-05:00"));

    const day2 = await createRawSession({
      userId: user.id,
      startedAt: new Date("2026-01-06T18:00:00-05:00"),
    });
    const res2 = await submitAt(day2.id, new Date("2026-01-06T18:05:00-05:00"));
    expect((await res2.json()).currentStreak).toBe(2);

    // Jan 7 is skipped entirely — no session at all that day.

    const day4 = await createRawSession({
      userId: user.id,
      startedAt: new Date("2026-01-08T18:00:00-05:00"),
    });
    const res4 = await submitAt(day4.id, new Date("2026-01-08T18:05:00-05:00"));
    expect((await res4.json()).currentStreak).toBe(1);
  });

  it("attributes a session begun before midnight and submitted after to the day it started", async () => {
    const user = await createTestUser({ timezone: TZ });
    setMockClerkUserId(user.id);

    // Day A: streak = 1
    const dayA = await createRawSession({
      userId: user.id,
      startedAt: new Date("2026-06-01T20:00:00-04:00"),
    });
    await submitAt(dayA.id, new Date("2026-06-01T20:05:00-04:00"));

    // Day B: streak = 2. Started 11:58pm local, submitted 00:05am the next
    // local day. If the app used wall-clock "now" instead of startedAt to
    // decide the day-of-record, this would wrongly land on Day C (which has
    // no other submission that day) and the streak would incorrectly reset
    // to 1 instead of continuing to 2.
    const dayB = await createRawSession({
      userId: user.id,
      startedAt: new Date("2026-06-02T23:58:00-04:00"),
    });
    const resB = await submitAt(dayB.id, new Date("2026-06-03T00:05:00-04:00"));
    expect((await resB.json()).currentStreak).toBe(2);

    const stored = await prisma.session.findUniqueOrThrow({ where: { id: dayB.id } });
    expect(stored.status).toBe(SessionStatus.SUBMITTED);
  });

  it("continues the streak correctly across a DST spring-forward transition", async () => {
    // America/New_York DST 2026: clocks jump 2:00am -> 3:00am on Mar 8.
    // Naive "subtract 24 real hours, reformat" date math skips a calendar
    // day across this boundary for early-morning local times (see
    // previousDateKey's comment in lib/streak.ts) — this test would fail
    // under that implementation.
    const user = await createTestUser({ timezone: TZ });
    setMockClerkUserId(user.id);

    const beforeDst = await createRawSession({
      userId: user.id,
      startedAt: new Date("2026-03-08T00:15:00-05:00"), // Mar 8, still EST
    });
    await submitAt(beforeDst.id, new Date("2026-03-08T00:20:00-05:00"));

    const afterDst = await createRawSession({
      userId: user.id,
      startedAt: new Date("2026-03-09T00:15:00-05:00"), // Mar 9, now EDT
    });
    const res = await submitAt(afterDst.id, new Date("2026-03-09T00:20:00-04:00"));
    expect((await res.json()).currentStreak).toBe(2);
  });

  it("previousDateKey is correct across the spring-forward boundary (calendar arithmetic, not 24h subtraction)", () => {
    expect(previousDateKey("2026-03-09")).toBe("2026-03-08");
    expect(previousDateKey("2026-03-08")).toBe("2026-03-07");
    expect(previousDateKey("2026-01-01")).toBe("2025-12-31");
  });

  it("computeNextStreak is the same function the submit route calls (no separate test-only date math)", async () => {
    const user = await createTestUser({ timezone: TZ, prepDurationMinutes: 10 });
    const session = await createRawSession({
      userId: user.id,
      startedAt: new Date("2026-01-05T18:00:00-05:00"),
    });

    const next = await computeNextStreak(prisma, user, session);
    expect(next).toBe(1);
  });
});
