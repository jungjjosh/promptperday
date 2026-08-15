import { NextRequest } from "next/server";

// Matches this project's existing no-auth posture (see lib/currentUser.ts):
// if CRON_SECRET isn't configured, the trigger route is open — fine for
// local/personal use. Set CRON_SECRET before pointing a real external
// scheduler at these routes.
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  return request.headers.get("authorization") === `Bearer ${secret}`;
}
