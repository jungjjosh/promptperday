import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// /api/jobs/* stays out of Clerk's protection — an external scheduler
// (Vercel Cron) has no Clerk session to send, and already has its own,
// separate CRON_SECRET bearer-token check (lib/cronAuth.ts). /sign-in and
// /sign-up obviously have to be reachable while signed out.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/jobs(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
