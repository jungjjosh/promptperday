// force-dynamic: this route always throws, so Next's build-time static
// prerendering pass (which invokes the handler to generate output) would
// otherwise fail the build itself — same fix as app/page.tsx uses, for a
// different reason (see CLAUDE.md's BEGIN tab section).
export const dynamic = "force-dynamic";

// Diagnostic-only: intentionally throws so you can confirm Sentry is
// wired up correctly after deploying. Visit this route once (it's behind
// the same login as everything else), then check the Sentry dashboard for
// the event. Deliberately left in place rather than removed after use —
// harmless unless someone hits it on purpose, and useful again after any
// future Sentry config change.
export async function GET() {
  throw new Error("Sentry test error — seeing this in Sentry means it's wired up correctly.");
}
