import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as login } from "@/app/api/auth/login/route";
import { createSessionToken, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

function jsonRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("rejects an incorrect password with 401 and no cookie", async () => {
    const res = await login(jsonRequest({ password: "not-the-password" }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("rejects a missing password with 401", async () => {
    const res = await login(jsonRequest({}));
    expect(res.status).toBe(401);
  });

  it("accepts the correct password (APP_PASSWORD from .env.test) and sets a valid session cookie", async () => {
    const res = await login(jsonRequest({ password: process.env.APP_PASSWORD }));
    expect(res.status).toBe(200);

    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);

    const valid = await verifySessionToken(cookie!.value);
    expect(valid).toBe(true);
  });
});

describe("lib/auth session tokens", () => {
  it("round-trips: a freshly created token verifies as authenticated", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it("rejects a tampered or garbage token", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(`${token}tampered`)).toBe(false);
    expect(await verifySessionToken("not-a-jwt-at-all")).toBe(false);
  });
});
