import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SessionStatus } from "@prisma/client";
import { POST as startSession } from "@/app/api/sessions/start/route";
import { POST as rerollSession } from "@/app/api/sessions/[id]/reroll/route";
import { POST as graceSession } from "@/app/api/sessions/[id]/grace/route";
import { PATCH as patchContent } from "@/app/api/sessions/[id]/content/route";
import {
  createRawSession,
  createTestUser,
  prisma,
  resetDb,
} from "./helpers";

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

describe("POST /api/sessions/start", () => {
  it("sets prep_ends_at and write_ends_at based on the user's prep duration, fixed at start", async () => {
    const user = await createTestUser({ prepDurationMinutes: 10 });
    const before = Date.now();

    const res = await startSession(
      jsonRequest("http://localhost/api/sessions/start", "POST", {
        userId: user.id,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    const prepEndsAt = new Date(body.prepEndsAt).getTime();
    const writeEndsAt = new Date(body.writeEndsAt).getTime();

    // prepEndsAt should be ~10 minutes from "now" at creation time
    expect(prepEndsAt).toBeGreaterThanOrEqual(before + 10 * 60_000 - 2_000);
    expect(prepEndsAt).toBeLessThanOrEqual(before + 10 * 60_000 + 5_000);

    // writeEndsAt should be exactly 5 minutes after prepEndsAt
    expect(writeEndsAt - prepEndsAt).toBe(5 * 60_000);

    const stored = await prisma.session.findUniqueOrThrow({
      where: { id: body.id },
    });
    expect(stored.prepEndsAt.getTime()).toBe(prepEndsAt);
    expect(stored.writeEndsAt.getTime()).toBe(writeEndsAt);
  });

  it("rejects a second session start with 409 if the user already submitted today", async () => {
    const user = await createTestUser({ timezone: "America/New_York" });
    await createRawSession({
      userId: user.id,
      status: SessionStatus.SUBMITTED,
      startedAt: new Date(),
    });

    const res = await startSession(
      jsonRequest("http://localhost/api/sessions/start", "POST", {
        userId: user.id,
      }),
    );

    expect(res.status).toBe(409);
  });

  it("allows a session start when a prior submission was on a different local day", async () => {
    const user = await createTestUser({ timezone: "America/New_York" });
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
    await createRawSession({
      userId: user.id,
      status: SessionStatus.SUBMITTED,
      startedAt: yesterday,
    });

    const res = await startSession(
      jsonRequest("http://localhost/api/sessions/start", "POST", {
        userId: user.id,
      }),
    );

    expect(res.status).toBe(201);
  });
});

describe("POST /api/sessions/:id/reroll", () => {
  it("succeeds once and then rejects any further reroll of either type", async () => {
    const session = await createRawSession();

    const first = await rerollSession(
      jsonRequest(
        `http://localhost/api/sessions/${session.id}/reroll`,
        "POST",
        { type: "question" },
      ),
      { params: { id: session.id } },
    );
    expect(first.status).toBe(200);

    const afterFirst = await prisma.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(afterFirst.rerollUsed).toBe(true);

    const second = await rerollSession(
      jsonRequest(
        `http://localhost/api/sessions/${session.id}/reroll`,
        "POST",
        { type: "category" },
      ),
      { params: { id: session.id } },
    );
    expect(second.status).toBe(400);

    const third = await rerollSession(
      jsonRequest(
        `http://localhost/api/sessions/${session.id}/reroll`,
        "POST",
        { type: "question" },
      ),
      { params: { id: session.id } },
    );
    expect(third.status).toBe(400);
  });
});

describe("POST /api/sessions/:id/grace", () => {
  it("succeeds once and rejects a second call", async () => {
    const session = await createRawSession({
      writeEndsAt: new Date(Date.now() + 60_000),
    });

    const first = await graceSession(
      jsonRequest(`http://localhost/api/sessions/${session.id}/grace`, "POST"),
      { params: { id: session.id } },
    );
    expect(first.status).toBe(200);

    const second = await graceSession(
      jsonRequest(`http://localhost/api/sessions/${session.id}/grace`, "POST"),
      { params: { id: session.id } },
    );
    expect(second.status).toBe(400);
  });

  it("rejects if the write phase has already ended", async () => {
    const session = await createRawSession({
      writeEndsAt: new Date(Date.now() - 1_000),
    });

    const res = await graceSession(
      jsonRequest(`http://localhost/api/sessions/${session.id}/grace`, "POST"),
      { params: { id: session.id } },
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/sessions/:id/content", () => {
  it("rejects a save after write_ends_at with no grace used", async () => {
    const session = await createRawSession({
      writeEndsAt: new Date(Date.now() - 1_000),
      graceUsed: false,
    });

    const res = await patchContent(
      jsonRequest(
        `http://localhost/api/sessions/${session.id}/content`,
        "PATCH",
        { content: { text: "draft" } },
      ),
      { params: { id: session.id } },
    );
    expect(res.status).toBe(403);
  });

  it("accepts a save within the 60s grace window past write_ends_at", async () => {
    const session = await createRawSession({
      writeEndsAt: new Date(Date.now() - 30_000),
      graceUsed: true,
    });

    const res = await patchContent(
      jsonRequest(
        `http://localhost/api/sessions/${session.id}/content`,
        "PATCH",
        { content: { text: "draft" } },
      ),
      { params: { id: session.id } },
    );
    expect(res.status).toBe(200);
  });

  it("rejects a save past the extended grace deadline", async () => {
    const session = await createRawSession({
      writeEndsAt: new Date(Date.now() - 90_000),
      graceUsed: true,
    });

    const res = await patchContent(
      jsonRequest(
        `http://localhost/api/sessions/${session.id}/content`,
        "PATCH",
        { content: { text: "draft" } },
      ),
      { params: { id: session.id } },
    );
    expect(res.status).toBe(403);
  });
});
