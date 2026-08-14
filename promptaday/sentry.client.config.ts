import * as Sentry from "@sentry/nextjs";

// NEXT_PUBLIC_SENTRY_DSN unset (e.g. running locally without Sentry
// configured) makes this a silent no-op rather than an error — nothing
// else in the app needs to branch on whether Sentry is configured.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
