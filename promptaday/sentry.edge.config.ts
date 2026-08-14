import * as Sentry from "@sentry/nextjs";

// Covers middleware.ts and any edge-runtime route handlers.
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
