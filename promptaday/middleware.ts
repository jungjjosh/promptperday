import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

// Left ungated: the login page/API itself (or nothing would ever be able to
// authenticate), and /api/jobs/* (already gated by CRON_SECRET via
// lib/cronAuth.ts — an external scheduler has no session cookie to send, and
// shouldn't need one).
const PUBLIC_PATHS = new Set(["/login"]);
const PUBLIC_PREFIXES = ["/api/auth/", "/api/jobs/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = token ? await verifySessionToken(token) : false;

  if (authenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

// Excludes Next's own static/image assets; everything else (including
// /favicon.ico, which has no sensitive content) goes through the check
// above rather than a longer exclusion list here.
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
