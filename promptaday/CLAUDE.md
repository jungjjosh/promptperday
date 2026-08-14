# promptperday — Project Reference

This is the standing source of truth for this project. It describes everything
built so far (Phases 1–8) in enough detail that a skilled developer could
recreate the project from scratch without guessing at a decision: the stack,
the exact data model and why each field exists, every API route's contract,
the BEGIN tab's UI architecture, and every deliberate simplification or
deviation from the original spec, with the reasoning behind it.

It is a living document — update it as later phases land. This file
supersedes and replaces the former AGENTS.md, PROJECT.md, and README.md,
which have been deleted; nothing in those files is missing from here.

## Working in this codebase

This project pins **Next.js 14.2.35**, deliberately *not* the version
`create-next-app@latest` would scaffold today (Next 16 / React 19) — see "Why
Next.js 14" below. That was a choice for standard, tutorial-familiar
conventions, not a sign this is a bleeding-edge or unusual setup: treat it as
an ordinary, well-documented Next 14 App Router project.

That said, before making any framework-level change (routing conventions,
config, data fetching, font loading, etc.), consult the local docs at
`node_modules/next/dist/docs/` (resolved relative to this repo's root; in a
monorepo the `next` package may not be visible from every directory) rather
than relying purely on generic or training-data knowledge of Next.js — treat
it as the authoritative reference for this exact pinned version, and heed any
deprecation notices found there.

Note: `next dev` can auto-regenerate a top-level `AGENTS.md` boilerplate file
via `node_modules/next/dist/server/lib/generate-agent-files.js`. If it
reappears, its content is generic tooling boilerplate — this file (CLAUDE.md)
remains canonical. Do not re-add an `@AGENTS.md` import here if that happens.

## Product scope (v1 MVP)

promptperday is a web-first daily writing app: each day, each user gets
exactly one writing prompt (a random category + question), goes through a
timed prep phase and a timed write phase, then submits what they wrote. The
"single-user" framing in this document (and in the original spec) describes
what any one account experiences — one prompt a day, one streak, one
history — not a claim that the app only supports one account. As of Phase 8
it genuinely doesn't: real, isolated multi-account support via Clerk is
covered in "Auth" below. Some things built in earlier phases before that
existed are still explicitly account-agnostic/global by design (see
Category preferences, next) — those are called out individually, not implied
by "single-user" language elsewhere in this document.

**Four tabs:** BEGIN, HISTORY, SETTINGS, WHY? — all four are functional as of
Phase 4.

**Categories (seeded):** current events, philosophy, personal life —
toggleable via SETTINGS. The toggle is **global**
(`Category.enabledByDefault`), not per-account — one account's toggle
affects every other account's daily category pool too. This predates
Phase 8's real multi-account support (see "Auth" below) and was an
acceptable simplification when there was only ever one real user; it's a
live, real gap now that a second real account can actually exist — see
"Known simplifications."

**Explicitly out of scope for v1** (per the original spec): image upload,
Google Docs export, social feed, and any functional Friends/Public visibility
(the UI shows those options but only "For You" is selectable).

### Session rules

- Prep duration is user-configurable: 5 / 10 / 15 / 20 minutes, default 10.
- Write duration is always fixed at 5 minutes, not configurable.
- Both durations are computed once when a session starts (`prep_ends_at`,
  `write_ends_at`) and never recomputed, even if the user's prep-duration
  setting changes mid-session.
- Exactly one reroll per session, spendable on the category **or** the
  question, not both.
- Exactly one 60-second grace extension per session, applied via an explicit
  button during the write phase.
- Only one **submitted** session per local calendar day, where "local" means
  the day is computed in the user's stored IANA timezone, not the server's.
- A session's day-of-record is when it was *started* ("Begin" pressed), not
  when it ends — a session begun at 11:58pm and finished after midnight still
  counts for the earlier day. See "Streak semantics" below.
- Deleting the current day's in-progress draft lets the user start over the
  same day. Deleting a **past** day's entry (not built yet — will live in
  HISTORY) does *not* retroactively affect the streak: the streak is a
  running value credited at the time a day completes, not something
  recomputed by scanning history. Streak only resets to 0 when a day ends
  with no submitted entry.

### Streak semantics — implemented in Phase 6

`User.currentStreak` (`Int @default(0)`) is a persisted,
independently-maintained value, *not* derived by counting `Entry`/`Session`
rows — see the delete-a-past-entry rule above: deleting old content must not
change a streak that was already earned. It's updated in exactly one place:
[`lib/streak.ts`](lib/streak.ts)'s `computeNextStreak`, called from
`POST /api/sessions/:id/submit`.

**No background job.** There's no scheduler resetting streaks at midnight
for users who missed a day (consistent with this project's existing
no-in-process-scheduler posture — see "Question sourcing and review"
below). Instead the check is lazy: at submission time, `computeNextStreak`
looks up only the single most recently `SUBMITTED` session for the user
(one bounded, indexed query — not a history scan) and compares its local
day (via `localDateKey`, the same helper `/start` uses) to the local day
immediately before the session being submitted. If they match, the streak
continues (`currentStreak + 1`); otherwise — first-ever submission, or any
size of gap — today's submission starts a fresh 1-day streak
(`currentStreak = 1`, confirmed with the user rather than assumed: a gap
resets state, but the day just submitted still always counts as a 1-day
streak rather than showing 0 until the following day).

**Day-of-record, not wall-clock time.** The "local day" used is always
`session.startedAt` — the same field that governs the one-submission-per-day
rule (see "Session rules" above) — never the real time `computeNextStreak`
happens to run at. A session begun at 11:58pm and submitted after midnight
still extends (or breaks) the streak as if it happened on the day it
started.

**DST-safe by construction.** `lib/streak.ts`'s `previousDateKey` computes
"the calendar day before X" via arithmetic on the Y/M/D fields of a
UTC-anchored scratch `Date` (`Date.UTC(y, m-1, d)`, then
`setUTCDate(d - 1)`), not by subtracting 86,400,000ms from a real instant
and reformatting. A local calendar day isn't always 24 real hours across a
DST transition (23 or 25), so the naive subtraction approach can land on
the wrong local calendar date for early-morning timestamps right around the
transition — verified by a dedicated test in
[`tests/streak.test.ts`](tests/streak.test.ts) using a real
America/New_York spring-forward date (2026-03-08).

### Testing (streak)

[`tests/streak.test.ts`](tests/streak.test.ts) calls the real
`POST /api/sessions/:id/submit` route handler (with the system clock mocked
via `vi.useFakeTimers()` / `vi.setSystemTime()`) for every case, rather than
calling `computeNextStreak` directly, so the tests exercise the exact logic
the app uses in production — one test explicitly confirms
`computeNextStreak` is that same function. Covers: normal consecutive-day
increments (1 → 2 → 3), a missed day resetting the next submission to 1
(not continuing the prior increment), a session started before midnight and
submitted after correctly extending the streak by its *start* day rather
than the day it happened to be submitted on, and the DST spring-forward
case described above.

## Tech stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | Next.js, App Router | 14.2.35 | Explicitly requested. `create-next-app@latest` defaults to Next 16/React 19 — pin explicitly if recreating. |
| Language | TypeScript | ^5 | Requested. |
| UI runtime | React / React DOM | 18.3.x | Paired with Next 14; Next 16 would want React 19. |
| ORM | Prisma | 6.19.3 (client + CLI) | See "Why Prisma 6, not 7" below. |
| Database | PostgreSQL | 16 (via Homebrew) | Requested. Any Postgres 14+ should work. |
| Rich text | TipTap | 3.30.1 (`@tiptap/react`, `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-text-style`, `@tiptap/extension-character-count`) | TipTap v3 is current stable; v2-era extension packages (`@tiptap/extension-color`, `@tiptap/extension-font-family`) are now folded into `@tiptap/extension-text-style` — install those separately and you'll get duplicate/conflicting `TextStyle` marks. |
| Font | `next/font/google` `Inter` | — | The scaffolded `Geist`/`Geist Mono` fonts aren't available via `next/font/google` on Next 14, so the app uses Inter instead (`app/layout.tsx`). |
| Tests | Vitest | 4.1.10 | Runs against a real second Postgres database, not mocks — see "Testing" below. |
| Lint | ESLint | 8.57.1 (`eslint-config-next@14`) | Pinned to v8 because `eslint-config-next@14` doesn't support ESLint 9's flat config; `create-next-app` scaffolds ESLint 9 by default. |
| LLM | `@anthropic-ai/sdk` | 0.117.1, model `claude-opus-5` | Phase 5's AI-generated-question job. Structured output via `client.messages.parse()` + `zodOutputFormat` (needs `zod` ^4, installed alongside). |
| Auth | `@clerk/nextjs` | 6.39.6 | Phase 8, replacing Phase 7's shared-password gate (see "Auth" below). Pinned to the 6.x line specifically — `@clerk/nextjs@7` requires Next ^15.2.8+; 6.39.6 is the latest release whose peer range (`^13.5.7 \|\| ^14.2.25 \|\| ^15.2.3 \|\| ^16`) still covers this project's pinned Next 14.2.35. Chosen over building per-user auth from scratch or Supabase Auth: real signup/login/session handling without writing it, and — unlike Supabase Auth, which centers on Supabase's own Postgres — it's a pure identity provider that doesn't care which Postgres host the app's own data lives on (this project uses Neon, per "Deployment" below), so adding it doesn't entangle two different services' opinions about where the database lives. |
| Error tracking | `@sentry/nextjs` | 10.70.0 | Phase 7. Classic per-runtime config files (`sentry.{client,server,edge}.config.ts`), not the newer `instrumentation.ts`/`instrumentation-client.ts` convention — see "Deployment" below for why. |
| Analytics | `posthog-js` | 1.417.1 | Phase 7, client-side only. Basic autocapture + manually-captured pageviews (App Router navigations aren't full page loads, so PostHog's own pageview autocapture never fires) — see "Deployment" below. |

### Why Prisma 6, not 7

`prisma init` on a fresh install pulls Prisma 7, which removed the `url`
field from the `datasource` block in `schema.prisma` — Postgres connections
now require a driver adapter (`@prisma/adapter-pg` + `pg`) passed explicitly
to the `PrismaClient` constructor everywhere it's instantiated. That's a real
amount of extra ceremony for no benefit at this project's scale, and it's a
very recent breaking change, so the project is pinned to Prisma 6, which
keeps the standard `DATABASE_URL`-based `new PrismaClient()` pattern most
Prisma+Next tutorials and this project's own route handlers assume.

### Why Next.js 14, not the create-next-app default

Explicitly requested by spec. `create-next-app@latest` at the time of writing
scaffolds Next 16 + React 19; both were downgraded (`npm install next@14
react@18 react-dom@18`), which also required: deleting the v16-only
`next.config.ts` in favor of `next.config.mjs` (v14 doesn't support the `.ts`
config format), replacing the scaffolded `Geist`/`Geist Mono` fonts with
`Inter` (Geist isn't available via `next/font/google` on v14), and removing
the `LayoutProps<"/">` typed-routes helper type (a v16 feature) in favor of a
plain `{ children: React.ReactNode }` prop type.

## Environment setup (from a clean checkout)

```bash
# 1. Install dependencies
npm install

# 2. Postgres (if not already running) — this project uses Homebrew Postgres on macOS
brew install postgresql@16
brew services start postgresql@16
createdb promptperday       # dev database
createdb promptperday_test  # test database (Vitest's globalSetup migrates/seeds this automatically)

# 3. Environment files (gitignored — not committed)
echo 'DATABASE_URL="postgresql://<you>@localhost:5432/promptperday?schema=public"' > .env
echo 'DATABASE_URL="postgresql://<you>@localhost:5432/promptperday_test?schema=public"' > .env.test
# Required as of Phase 8 — the app won't start at all without both, and
# nobody can actually sign in until they're real. Create a free app at
# clerk.com and paste in its keys; see "Auth" below for the full runbook.
echo 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_<your Clerk publishable key>"' >> .env
echo 'CLERK_SECRET_KEY="sk_test_<your Clerk secret key>"' >> .env
# No Clerk keys needed in .env.test — tests/setupClerkMock.ts mocks
# @clerk/nextjs/server entirely, so the suite never talks to Clerk.
# Only needed to actually run the Phase 5 jobs (not needed for the rest of
# the app, and the test suite mocks both — see .env.test's NEWS_API_KEY,
# which is a placeholder string, never a real key):
echo 'NEWS_API_KEY="<your NewsAPI.org key>"' >> .env
echo 'ANTHROPIC_API_KEY="<your Anthropic API key>"' >> .env
echo 'CRON_SECRET="<any random string>"' >> .env  # optional locally — see lib/cronAuth.ts
# Optional locally — Sentry/PostHog no-op cleanly when these are unset (see
# "Deployment" below); only worth setting locally if you want local errors/
# events to actually show up in a real Sentry/PostHog project.
echo 'NEXT_PUBLIC_SENTRY_DSN=""' >> .env
echo 'NEXT_PUBLIC_POSTHOG_KEY=""' >> .env

# 4. Migrate + seed the dev database
npx prisma migrate dev
npx prisma db seed

# 5. Run it
npm run dev          # http://localhost:3000 — redirects to /sign-in
npm test              # vitest — migrates/seeds promptperday_test itself, no manual step needed
npm run build          # production build sanity check
```

No `.env.example` exists yet — worth adding in a later phase. See "Deployment"
below for the full environment variable checklist covering every phase,
including which are required vs. optional, and where each one is used.

## Data model

Full schema lives in [`prisma/schema.prisma`](prisma/schema.prisma). Field
names are camelCase in the Prisma Client API and explicitly `@map`'d to
snake_case columns in Postgres (e.g. `prepDurationMinutes` ↔
`prep_duration_minutes`) to match the snake_case field names as originally
specified while keeping idiomatic TypeScript on the application side.

### Models, as originally specified (Phase 1)

- **User** — `id, email, timezone, prepDurationMinutes (default 10), createdAt`
  — plus `currentStreak (default 0)`, added in Phase 6 (see "Streak
  semantics" below), beyond the original Phase 1 field list
- **Category** — `id, name, enabledByDefault`
- **Question** — `id, categoryId, text, sourceType (curated | ai_generated |
  news_derived), status (pending_review | approved | archived), createdAt`
- **Session** — `id, userId, categoryId, questionId, prepEndsAt, writeEndsAt,
  rerollUsed, graceUsed, status (prepping | writing | submitted)`
- **Entry** — `id, sessionId, userId, title, description, visibility, content
  (Json), sources (String[]), createdAt`
- **UserQuestionHistory** — `userId, questionId, shownAt` (composite primary
  key on all three columns — there's no separate `id`, matching the original
  field list exactly; logs every question shown to a user so future
  selections can exclude repeats)

### One field added beyond the original spec: `Session.startedAt`

The original Phase 1 field list for `Session` didn't include a "when did this
begin" timestamp. Phase 2's "one submission per local calendar day" rule and
the confirmed streak rule ("a session begun before midnight counts for that
day") both require knowing the actual begin-time. `prepEndsAt` can't stand in
for it: prep duration is user-configurable (5–20 min) and can cross
midnight, so `localDateKey(prepEndsAt)` and `localDateKey(startTime)` can
disagree right at the day boundary. `startedAt DateTime @default(now())` was
added to `Session` and flagged to the user before implementing it rather than
silently working around the gap. Migration:
`prisma/migrations/20260814071825_add_session_started_at/`.

### Enums map to the exact string values originally specified

Each enum value carries an explicit `@map(...)` (e.g. `CURATED
@map("curated")`) so the Postgres columns store the lowercase/snake_case
strings from the spec (`curated`, `pending_review`, `for_you`, etc.) while
Prisma Client exposes SCREAMING_CASE TS enum members (`SourceType.CURATED`),
which is Prisma's idiom.

### Visibility enum

```prisma
enum Visibility {
  FOR_YOU @map("for_you")
  FRIENDS @map("friends")
  PUBLIC  @map("public")
}
```

Per the user: "For You" **is** the private default — there's no separate
"Private" state. `Entry.visibility` defaults to `FOR_YOU`, and it's the only
value the API or UI will ever actually set in v1 (see
`/api/sessions/:id/submit` below).

## API routes

Session lifecycle routes live under `app/api/sessions/`; Phase 4 added
`app/api/categories/[id]` and `app/api/users/[id]`; Phase 5 added
`app/api/questions/[id]` and the job-trigger routes under `app/api/jobs/`
(documented in "Question sourcing and review" below, not repeated here).
Every route below sits behind Clerk's session check in
[`middleware.ts`](middleware.ts) (see "Auth" below) except the two
job-trigger routes, which use their own `CRON_SECRET` check instead — an
external scheduler has no Clerk session to send. As of Phase 8, most
`:id`-scoped routes also do their own **ownership check**: being
authenticated is no longer enough on its own, since more than one real
account can now exist, and a session/entry/user `:id` is just an opaque
string a curious authenticated account could otherwise guess or copy from
their own network tab. Each route's entry below says explicitly whether it
checks ownership; see "Auth" for why the check is a plain string comparison
rather than an extra database lookup.

### POST `/api/sessions/start`

No body — the acting user comes from the Clerk session (`auth()`), not a
request field. Through Phase 7 this took `{ userId: string }` in the body
and trusted it outright; that stopped being safe the moment a second real
account could exist; see "Auth" below.

1. 401 if there's no authenticated Clerk session. Otherwise resolves (and,
   on a first-ever request from this account, lazily creates) the acting
   user via `getOrCreateUser()` — see "Auth" below. There's no "user
   doesn't exist" 404 case anymore; a valid Clerk session always resolves
   to a real `User` row, created on demand if needed.
2. 409 (`"Already submitted a prompt today"`) if the user has a `Session`
   with `status = SUBMITTED` whose `startedAt`, converted to the user's
   stored timezone, falls on today's local calendar date.
3. Picks a random `Category` where `enabledByDefault = true`.
4. Picks a random `Question` in that category with `status = APPROVED`,
   excluding any question already in that user's `UserQuestionHistory`. If
   every question in the category has been shown before (realistic after
   ~10 uses against the seed data), falls back to ignoring history rather
   than erroring — a 10-question seed pool would otherwise permanently break
   the daily flow for a long-running user.
5. Reads `User.prepDurationMinutes` (default 10), computes `prepEndsAt = now
   + prepDurationMinutes`, and `writeEndsAt = prepEndsAt + 5 minutes` — both
   fixed at creation, never recomputed.
6. Creates the `Session` and logs the shown question to
   `UserQuestionHistory`, in one transaction.
7. 201, body: `{ id, category: { id, name }, question: { id, text },
   prepEndsAt, writeEndsAt }`.

### POST `/api/sessions/:id/reroll`

Body: `{ type: "category" | "question" }`

- 400 if `type` is neither value.
- 404 if the session doesn't exist **or belongs to a different account**
  (Phase 8 — same response either way, so this never confirms another
  account's session id is valid; see "Auth" below).
- 409 if the session is already `SUBMITTED`.
- 400 (`"Reroll already used for this session"`) if `rerollUsed` is already
  true — applies regardless of which `type` is requested; there is exactly
  one reroll total, not one per type.
- `type: "category"` picks a new random enabled category (excluding the
  current one, if more than one is enabled) and a new question within it.
- `type: "question"` keeps the current category and picks a new question
  within it, excluding both history and the currently-assigned question.
- Sets `rerollUsed = true`, logs the new question to `UserQuestionHistory`.
- 200, body: `{ id, category, question, rerollUsed: true }`.

### POST `/api/sessions/:id/grace`

- 404 if the session doesn't exist or belongs to a different account (Phase 8 — see "Auth" below).
- 400 if `graceUsed` is already true.
- 400 if `now > writeEndsAt` (too late to ask for grace).
- Sets `graceUsed = true`.
- 200, body: `{ id, graceUsed: true, effectiveDeadline }` where
  `effectiveDeadline = writeEndsAt + 60s`.

### PATCH `/api/sessions/:id/content`

Body: `{ content: <TipTap JSON> }`

- 404 if the session doesn't exist or belongs to a different account (Phase 8 — see "Auth" below).
- 403 if `now` is past the effective deadline (`writeEndsAt`, or
  `writeEndsAt + 60s` if `graceUsed`).
- Upserts `Entry` by `sessionId` (creating it with default
  title/description/visibility on first call), setting `content`.
- 200, body: `{ id, sessionId, content }`.
- This is the **autosave** endpoint — called client-side every 10s and on
  editor blur during the write phase (see "WriteScreen" below). It
  intentionally has no knowledge of title/description/visibility/sources/
  final submission.

### POST `/api/sessions/:id/submit` — added in Phase 3, not part of the original four

Body: `{ title?, description?, sources?: string[] }`

- 404 if the session doesn't exist or belongs to a different account (Phase 8 — see "Auth" below).
- 409 if already `SUBMITTED`.
- Upserts `Entry` (in case autosave never fired — falls back to an empty
  TipTap document for `content` if no prior autosave exists) with the given
  title/description/sources, and forces `visibility = FOR_YOU` regardless of
  what's sent — no other value is functional in v1, so it's silently
  normalized rather than rejected.
- Sets `Session.status = SUBMITTED` in the same transaction. Also updates
  `User.currentStreak` in that same transaction — see "Streak semantics"
  above; the new value is read (non-transactionally, same trade-off as
  `/start`'s already-submitted-today check) via
  `computeNextStreak` before the transaction starts.
- 200, body: `{ id, sessionId, status: "submitted", currentStreak }`.
- **No deadline check** — can technically be called during prep or write,
  since the only UI path that calls it is the submission screen, which only
  appears after the write timer expires. Not gated server-side because
  nothing in this phase's scope exposes an early-submit button; add a guard
  if that changes.

### DELETE `/api/sessions/:id/entry` — added in Phase 3, not part of the original four

- 404 if no `Entry` exists for that session, or it belongs to a different
  account (Phase 8 — checked against `Entry.userId` directly, no extra
  `Session` lookup needed; see "Auth" below).
- Deletes the `Entry` row. Does **not** touch the `Session` row.
- 200, body: `{ deleted: true }`.
- This is what "Delete" on the submission screen calls. Because `/start`'s
  409 check only looks at `SUBMITTED` sessions, deleting an unsubmitted
  draft's entry and returning to the idle screen naturally allows a
  same-day retry — no separate "reset" logic needed.
- Designed to also work for a *past* day's entry once HISTORY exists (same
  route, same semantics), without retroactively touching the streak — see
  "Streak semantics" above.

### Why `/submit` and `/entry` exist despite "no new endpoints"

Phase 3 was scoped as "wire the UI to the Phase 2 endpoints, no new
endpoints." But none of the four Phase 2 routes can persist
title/description/visibility/sources or flip `Session.status` to
`SUBMITTED` — and `PATCH /content` explicitly 403s once `writeEndsAt`
passes, which is exactly when the submission screen appears. Raised this
conflict directly rather than silently picking a side; the user chose
adding two small, single-purpose endpoints over overloading `PATCH
/content` with a status flag and a loosened deadline check.

### PATCH `/api/categories/:id` — added in Phase 4

Body: `{ enabledByDefault: boolean }`

- 404 if the category doesn't exist.
- 400 if `enabledByDefault` isn't a boolean.
- 400 (`"At least one category must stay enabled"`) if this would disable
  the last remaining enabled category — without this guard, `/start`'s
  `pickCategory` would have nothing to pick from and 500. SETTINGS also
  disables this client-side (can't toggle off the last active switch), but
  the server check is the real guard since the API doesn't otherwise trust
  the client.
- 200, body: `{ id, name, enabledByDefault }`.

### PATCH `/api/users/:id` — added in Phase 4

Body: `{ prepDurationMinutes: number }`

- 404 if `:id` doesn't match the authenticated Clerk session (Phase 8 — an
  account can only ever update its own settings; see "Auth" below) or the
  user otherwise doesn't exist.
- 400 if `prepDurationMinutes` isn't one of `5, 10, 15, 20`.
- 200, body: `{ id, prepDurationMinutes }`.
- This is what SETTINGS' prep-duration dropdown calls. `/start` already
  read `User.prepDurationMinutes` since Phase 2 — this route is the only
  piece that was missing to make the setting actually changeable.

### `/start` and `/reroll` hardening — added in Phase 4

Both routes now catch `NoCategoriesAvailableError` /
`NoQuestionsAvailableError` (thrown by `lib/questionPool.ts`) and return a
clean `400` instead of an unhandled `500`. Before Phase 4 this was an
unreachable theoretical edge case; once SETTINGS could actually disable
every category, it became a real path a user could hit (a race between two
browser tabs, for instance, since the last-enabled-category guard on `PATCH
/api/categories/:id` isn't transactional against a concurrent `/start`
call) — cheap to guard against, so it's guarded.

## Auth

Auth has gone through three distinct eras, each worth understanding because
later phases build on the trade-offs the earlier ones made:

- **Through Phase 6**: no login at all. `lib/currentUser.ts` resolved to one
  lazily created `User` row (`you@promptperday.local`), and every route
  trusted whatever `userId` / session `:id` it was given — fine, because
  there was exactly one real user and nothing to check ownership against.
- **Phase 7**: a single shared app password (`APP_PASSWORD`) gated the whole
  app behind one login, so a deployed URL wasn't wide open to anyone who
  found it. Still one real user underneath — routes still trusted
  client-supplied ids, just as before.
- **Phase 8 (current)**: real per-account identity via Clerk — the subject
  of the rest of this section. The Phase 7 shared-password gate
  (`lib/auth.ts`, the old `middleware.ts`, `/login`,
  `/api/auth/{login,logout}`) has been deleted outright, not layered under.

### How Clerk is wired in

- [`middleware.ts`](middleware.ts) uses `clerkMiddleware()` +
  `createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/jobs(.*)"])`:
  everything not matching that list requires a valid Clerk session
  (`auth.protect()`), including every page and every API route documented
  above. `/api/jobs/*` stays exempt for the same reason it always has —
  Vercel Cron has no Clerk session to send, and keeps its own, separate
  `CRON_SECRET` bearer-token check (unchanged since Phase 5).
- [`app/layout.tsx`](app/layout.tsx) wraps the whole app in `<ClerkProvider>`.
  [`app/sign-in/[[...sign-in]]/page.tsx`](app/sign-in/[[...sign-in]]/page.tsx)
  and [`app/sign-up/[[...sign-up]]/page.tsx`](app/sign-up/[[...sign-up]]/page.tsx)
  render Clerk's own prebuilt `<SignIn/>`/`<SignUp/>` components, unmodified
  — catch-all routes (`[[...sign-in]]`) because Clerk's components handle
  their own multi-step sub-routing (verification codes, etc.) internally.
  [`components/NavTabs.tsx`](components/NavTabs.tsx) uses Clerk's
  `<UserButton/>` for sign-out (its popover), and hides the whole nav bar on
  `/sign-in`/`/sign-up` via `usePathname`.
- **No social login, no custom email-verification UI, no account-settings
  page** — explicitly out of scope for this phase. Clerk's default new-app
  configuration (email + password, its own verification-code flow) is used
  as-is; if you want social providers off, that's a one-time toggle in the
  Clerk dashboard, not code here.

### `User.id` is Clerk's user id, not a generated one

`prisma/schema.prisma`'s `User.id` lost its `@default(cuid())` this phase —
it's `String @id` with no default, because the id is always supplied
explicitly: [`lib/currentUser.ts`](lib/currentUser.ts)'s `getOrCreateUser()`
calls Clerk's `auth()` to get the current `userId` (e.g. `user_2abc...`),
looks up a `User` row with that exact id, and creates one (via Clerk's
`currentUser()` for the real email; timezone still taken from
`Intl.DateTimeFormat().resolvedOptions().timeZone` at creation time, same as
before) if this is that account's first authenticated request. Every page
(`app/page.tsx`, `app/history/page.tsx`, `app/settings/page.tsx`) calls this
instead of the old `getOrCreateDefaultUser()`.

This is also what makes the **ownership checks** on `:id`-scoped routes
cheap: since `Session.userId` / `Entry.userId` are foreign keys into
`User.id`, and `User.id` *is* the Clerk id, checking "does this session
belong to the caller" is a plain string comparison —
`session.userId !== (await auth()).userId` — no extra `User` lookup needed.
Added to `POST /start`, `POST /:id/reroll`, `POST /:id/grace`,
`PATCH /:id/content`, `POST /:id/submit`, `DELETE /:id/entry`, and
`PATCH /api/users/:id` (see each route's entry above for its exact
response); all return the same `404` for "doesn't exist" and "exists but
isn't yours," so no route ever confirms another account's id is valid.
`/api/categories/:id` and `/api/questions/:id` are deliberately **not**
ownership-checked — `Category`/`Question` are shared, global resources, not
account-owned (see "Known simplifications" for what that still means in a
real multi-account world).

### Migrating the pre-Clerk data

The single pre-Clerk `User` row (`you@promptperday.local`, and everything
that pointed at it — `Session`, `Entry`, `UserQuestionHistory` rows, plus
its `prepDurationMinutes`/`currentStreak`) doesn't move to a real account
automatically; nothing in the app does this for you, on purpose (see below).
[`lib/legacyMigration.ts`](lib/legacyMigration.ts)'s `migrateLegacyUser`
does the reassignment, wrapped in
[`scripts/migrate-legacy-user.ts`](scripts/migrate-legacy-user.ts) as a
one-time CLI script:

```bash
# 1. Sign in once via Clerk with your real account (creates that account's
#    User row via getOrCreateUser(), lazily, on the first authenticated
#    request — visit the app and sign up/in before running this).
# 2. Then, from your machine:
npx tsx scripts/migrate-legacy-user.ts you@your-real-email.com
```

It looks up the legacy row by its fixed placeholder email
(`you@promptperday.local`) and the target row by the real email you pass
in, then in one transaction: reassigns every `Session`/`Entry`/
`UserQuestionHistory` row's `userId` from the legacy id to the real Clerk
id, copies `prepDurationMinutes` and `currentStreak` onto the real account,
and deletes the now-empty legacy row. Throws
`LegacyUserNotFoundError`/`TargetUserNotFoundError` with a clear message if
either side isn't in the state it expects (see
[`tests/legacyMigration.test.ts`](tests/legacyMigration.test.ts) for both
cases plus the full-success path).

**Deliberately a manual, human-triggered script, not automatic "claim on
first login" logic in the app.** "Adopt the old single-user data" only
makes sense once, for the one real bootstrap account — if the app did this
automatically for every new signup, the *second* real person who ever
creates an account would silently inherit the first person's private
entries. A one-time script run by hand has no such failure mode.

### Why Clerk, not Supabase Auth or hand-rolled per-user auth

Both were on the table (the instruction that led to this phase named
Clerk/Supabase Auth as options). Supabase Auth centers on Supabase's own
Postgres (`auth.users` in Supabase's database) — using it while keeping this
project's Neon-hosted Postgres (see "Deployment" below) for the app's own
data would mean either migrating databases to Supabase or running Supabase
Auth as a semi-standalone service against an external Postgres, more
friction either way than a purpose-built identity provider that simply
doesn't care where the app's database lives. Hand-rolling per-user auth
(the Phase 7 shared-password approach, extended to real accounts) would
mean building signup, password hashing/storage, verification emails, and
session management from scratch for something several mature libraries
already do correctly — not a good use of effort for a feature that's
identity infrastructure, not this app's actual product.

## BEGIN tab UI architecture

Entry point: [`app/page.tsx`](app/page.tsx) — an async Server Component. It:

1. Resolves the signed-in user (`getOrCreateUser` — see "Auth" above).
2. Computes today's session state server-side (`getTodaySessionState`, in
   [`lib/todaySession.ts`](lib/todaySession.ts)) — mirrors `/start`'s
   day-boundary logic to return one of `idle` / `submitted` / `active` (with
   the active session's data). This is what makes "reload the page after
   submitting → see the congrats screen" work **without** a dedicated GET
   API route: the initial render is always server-computed from current DB
   state.
3. Marked `export const dynamic = "force-dynamic"` — required. Without it,
   Next tries to statically prerender `/` at build time, which both reads
   and can *write* (creating the default user) during the build's
   prerender pass; this surfaced as a real bug during Phase 3 (`Unique
   constraint failed on the fields: (email)`, from the prerenderer invoking
   the page function more than once) and is fixed by forcing per-request
   dynamic rendering. As of Phase 8 there's a second, independent reason it
   couldn't be static anyway: `getOrCreateUser()` calls Clerk's `auth()`,
   which has no session to read at build time.
4. Renders `<BeginFlow>`, a client component, with the server-computed
   initial state as a prop.

### State machine — [`components/begin/BeginFlow.tsx`](components/begin/BeginFlow.tsx)

Phases: `idle → prepping → writing → submission → congrats`.
`derivePhase()` turns the server's `idle`/`submitted`/`active` state into one
of these by comparing `now` against `prepEndsAt` and the effective write
deadline — this same derivation re-runs any time the component mounts, so a
mid-session page reload resumes at the correct phase instead of losing the
session or starting a duplicate one. (`/start` itself has no idempotency —
calling it twice in one day before submitting creates two sessions — so the
client must avoid ever calling it when a resumable session already exists;
`getTodaySessionState`'s server-side resolution is what prevents that.)

Each phase renders one screen component, which owns its own timers/network
calls and reports back up via callback props (`onExpire`, `onReroll`,
`onGraceUsed`, `onSubmit`, `onDelete`) rather than BeginFlow polling
anything.

### PrepScreen

Countdown to `prepEndsAt` (client `setInterval`, 1s tick). Reroll is
presented as two buttons ("New category" / "New question") sharing one
`rerollUsed` flag — read as "one reroll button, user picks which to spend it
on" rather than a dropdown/modal, since the spec explicitly frames it as one
control covering both options.

### WriteScreen

The most involved screen. Owns:

- **Countdown** to `writeEndsAt`, or `writeEndsAt + 60s` once `graceUsed` —
  this target is recomputed whenever `session.graceUsed` flips, so the
  grace extension visibly adds 60s to the on-screen timer immediately.
- **TipTap editor** (`useEditor` from `@tiptap/react`) with `StarterKit`,
  `TextStyle`, `Color`, `FontFamily`, `FontSize` (all from
  `@tiptap/extension-text-style` in v3 — see stack table above),
  `CharacterCount`. Toolbar exposes exactly the three controls the spec
  asked for — font size, color, family — as a `<select>`, `<input
  type="color">`, and `<select>` respectively, calling
  `editor.chain().focus().set…().run()`.
- **Legend**: a native `<details>` element (collapsible for free, no extra
  state needed beyond tracking `open` for styling) showing
  `editor.storage.characterCount.words()` / `.characters()`.
- **Grace button**: calls `POST /grace`; on success, flips local
  `graceUsed` (via `onGraceUsed` up to BeginFlow, which updates the shared
  session state) — does not manage its own extended-deadline math beyond
  what the countdown effect already derives from `graceUsed`.
- **Autosave**: `setInterval` every 10s, plus the TipTap editor's own
  `onBlur` callback, both calling the same `saveDraft()` which PATCHes
  `/content` with `editor.getJSON()`. A `ref` holds the latest JSON
  (updated on every `onUpdate`) so the interval closure never sends stale
  content. Also fires one best-effort save the instant the countdown hits
  zero, before flipping to the submission screen — a last-chance capture of
  anything typed in the final second, tolerant of the save losing the race
  against the server's own deadline check.
- **Focus-loss message** (Page Visibility API, detection only): tracks a
  `wasHidden` ref across `visibilitychange` events. Because a hidden tab
  can't render anything the user can see, the message only makes sense to
  show *on return* — so it fires when visibility flips back to visible
  after having been hidden, and auto-clears after 6s. This is deliberately
  **not** enforcement (no blocking, no penalty) — matches "detection only"
  in the spec.

### SubmissionScreen

Local-only form state (title, description, sources list, source-input
draft) — nothing round-trips to the server until Submit or Delete is
pressed. Visibility is three buttons, not a native `<select>`, specifically
so "coming soon" can be a real `title` tooltip on the disabled
Friends/Public buttons (native `<option disabled>` tooltips are unreliable
cross-browser). Sources are free-text with no cap: an "Add" button plus
Enter-to-add, rendered as a removable list. Delete and Submit call the two
Phase-3 endpoints and report back via `onDelete`/`onSubmit`.

### CongratsScreen / StartScreen

Static. `StartScreen`'s "Begin" button is the only thing that calls `POST
/start`.

### Styling note

[`components/begin/begin.module.css`](components/begin/begin.module.css)
hardcodes light-background surfaces (buttons, the editor card, form inputs)
with an explicit `color` and `color-scheme: light`. This was a real bug
found during click-through testing: the app shell follows the OS dark-mode
preference (`globals.css`), and without an explicit `color-scheme`, browsers
apply *dark* user-agent text color to form controls sitting on an
explicitly-white background — producing invisible white-on-white
button/input text. Setting `color-scheme: light` on those specific
light-surfaced elements fixes it without making the whole app
light-mode-only.

## SETTINGS tab UI architecture

[`app/settings/page.tsx`](app/settings/page.tsx) — Server Component, same
pattern as BEGIN: resolves the default user and fetches all categories
directly via Prisma (no GET endpoint needed), passes both down to
[`components/settings/SettingsForm.tsx`](components/settings/SettingsForm.tsx),
a client component.

`SettingsForm` renders each category as a toggle switch and the prep
duration as a `<select>` (5/10/15/20 min — write time is displayed as
fixed, not editable). Both controls update optimistically (flip local state
immediately) then call their PATCH endpoint; on a non-OK response, the
change is rolled back and the server's error message is shown. The "last
enabled category" guard is checked client-side too (before the request
fires) so the user gets instant feedback, but the source of truth is the
server-side check in `PATCH /api/categories/:id` — see the API section
above.

## HISTORY tab UI architecture

[`app/history/page.tsx`](app/history/page.tsx) — Server Component. Fetches
every `SUBMITTED` session for the default user (joined with its `Category`
and `Entry`) via [`lib/historyData.ts`](lib/historyData.ts)'s
`getHistoryEntries`, plus the full category list (for the legend, so
categories with zero entries still show up), and passes both to
[`components/history/HistoryView.tsx`](components/history/HistoryView.tsx).

**Emoji vs. color — these encode different things**, per an earlier,
explicit clarification: *emoji marks category, color marks completion* —
not "color per category."
[`lib/categoryStyle.ts`](lib/categoryStyle.ts) is a small fixed `name →
emoji` lookup (📰 current events, 🧠 philosophy, 💭 personal life; there's
no emoji/color column on `Category`, so this isn't stored state). Every day
*with* a submitted entry gets the same green "completed" styling regardless
of which category it was, with that day's category emoji on top of it.
Days *without* an entry get one of three neutral treatments: a bordered
"today" indicator, a muted gray "missed" treatment (only applied between
the user's earliest entry and yesterday — a day before any history exists
isn't a "miss"), or plain/dim for anything else (future dates, or days
before the first entry).

**Calendar**: a plain month grid built from `Date` geometry (`getDay()` for
the first weekday offset, `new Date(y, m+1, 0).getDate()` for
days-in-month) — `Sun`–`Sat` columns, prev/next month navigation via local
`{year, month}` state. Because all of the user's entries are fetched up
front (small dataset at this project's scale), navigating months is
instant with no extra network calls. Day cells are matched against entries
by a `YYYY-MM-DD` string key (`localDateKey`, same helper `/start` uses for
its day-boundary check) rather than comparing `Date` objects, avoiding a
second timezone-conversion path.

**Clicking a completed day** opens
[`components/history/EntryModal.tsx`](components/history/EntryModal.tsx): a
read-only TipTap instance (`editable: false`, same extension set as
`WriteScreen` — `StarterKit`, `TextStyle`, `Color`, `FontFamily`,
`FontSize` — so saved formatting renders correctly) plus
title/description/sources/date, and a **copy-to-clipboard** button
(`navigator.clipboard.writeText(editor.getText())` — plain text, not
HTML/rich-text clipboard formats, since the most likely destination is a
plain text field or another editor that wouldn't preserve TipTap-specific
marks anyway).

**Legend**: horizontal row below the calendar, one chip per category
(emoji + name + count), counting **all-time** submitted entries for that
category, not just the currently-viewed month — read as an overall
distribution snapshot rather than a per-month stat, so it doesn't change as
you navigate months.

## WHY tab

[`app/why/page.tsx`](app/why/page.tsx) — fully static, no data fetching.
Copy is the exact text provided in Phase 4: "AI can kill expression. Save
yours with a prompt per day." (the Phase 1 placeholder used "AI kills,"
without "can" — updated to match the exact wording once it was explicitly
provided). Same copy is also the page `<meta description>` in
`app/layout.tsx`.

## Question sourcing and review (Phase 5)

Two background jobs generate candidate `Question` rows at `status =
PENDING_REVIEW`, and one internal page lets you approve or reject them.
This is the piece that fills the seeded 30-question pool back up over time.

### News-derived current-events questions — [`lib/jobs/newsQuestions.ts`](lib/jobs/newsQuestions.ts)

Pulls headlines from [NewsAPI.org](https://newsapi.org)'s
`/v2/top-headlines` endpoint (the "[news API]" referenced in the spec — any
provider would fit behind this same function shape; NewsAPI was picked as a
concrete, common choice). `fetchHeadlines` takes an injectable `fetch`
implementation specifically so tests can mock it — the Phase 5 instruction
was explicit that external APIs must never be hit in the test suite.

Two independent filters, both required per the spec:

- **Source allowlist** ([`lib/newsSources.ts`](lib/newsSources.ts)) —
  Reuters, AP, BBC. Applied twice: once via the `sources` query param (so
  NewsAPI itself narrows the results) and again in code against
  `article.source.id` (defense in depth — doesn't trust the API to fully
  honor the query param, and gives the filter a home in code the tests can
  actually exercise).
- **Keyword denylist** ([`lib/newsSources.ts`](lib/newsSources.ts)) — a
  case-insensitive substring check against the raw headline for
  outrage-bait phrasing and explicit partisan-flashpoint terms. This is the
  automated backstop for "no hyper-partisan bait" now that there's no human
  approval gate before generation — see the note in `lib/newsSources.ts`
  and the "No pre-publish moderation" item below.

A passing headline is **not** inserted verbatim as the question text — it's
run through [`lib/currentEventsTemplates.ts`](lib/currentEventsTemplates.ts),
one of eight templates (chosen at random) that turns the headline into a
reflective writing prompt in the same style as the seeded questions ("Write
a letter to someone reading about this ten years from now...", "Argue the
strongest good-faith case for...", etc.) rather than a bare news blurb.
Inserted with `sourceType: NEWS_DERIVED`, `status: PENDING_REVIEW`, into the
`current events` category.

### AI-generated philosophy / personal-life questions — [`lib/jobs/aiQuestions.ts`](lib/jobs/aiQuestions.ts)

Calls the Anthropic Messages API (`@anthropic-ai/sdk`, model
`claude-opus-5`) with `client.messages.parse()` and a Zod schema (`{
questions: string[] }` × 10, via `zodOutputFormat` from
`@anthropic-ai/sdk/helpers/zod`) so the response is structurally guaranteed
parseable rather than hoping the model returns valid JSON. The generation
prompt ([`lib/aiQuestionPrompts.ts`](lib/aiQuestionPrompts.ts)) restates the
same style guide from the original SETTINGS spec verbatim — narrative
unfolding, reasoning through consequences, emotional unpacking; a mix of
hypotheticals, advice-column simulation, argue-the-other-side, letters
never sent, sensory reconstruction, ethical dilemmas, legacy/values
prompts — so AI-generated questions match the seeded ones in shape.

The `client` parameter is injectable (`Pick<Anthropic, "messages">`,
defaulting to a real client from
[`lib/anthropicClient.ts`](lib/anthropicClient.ts)) for the same
mock-in-tests reason as the news job. Inserted with `sourceType:
AI_GENERATED`, `status: PENDING_REVIEW`, into whichever of `philosophy` /
`personal life` was requested.

**No pre-publish moderation step** — per earlier direction, generated
questions go straight to `PENDING_REVIEW` and become usable the moment
they're approved; there's no queue-before-the-queue. This does mean the
keyword denylist above is the *only* automated safeguard on the news path,
and the AI path has no automated safeguard at all beyond whatever Claude's
own judgment applies to the generation prompt — both rely entirely on you
using the review page before approving.

### Triggering the jobs

Both are POST routes, not routes with UI of their own:

- `POST /api/jobs/news-questions` — no body.
- `POST /api/jobs/ai-questions` — body `{ category?: "philosophy" |
  "personal life" }`; omit to run both in one call.

Both are gated by [`lib/cronAuth.ts`](lib/cronAuth.ts): if `CRON_SECRET` is
set, requests need `Authorization: Bearer <secret>`; if unset, they're open.
This is intentionally a *separate* check from the Clerk auth covering every
other route (see "Auth" above) rather than folding these routes into that
gate — an external scheduler has no Clerk session to send, only a bearer
token, and `middleware.ts` explicitly exempts `/api/jobs/*` for exactly
that reason.
**These routes are meant to be invoked by an external scheduler** — either
a system cron entry running `curl -X POST .../api/jobs/news-questions`, or
(now that this is actually deployed) the `vercel.json` Cron Jobs entries at
the project root, which hit these same routes with a `GET` instead (see
"Deployment" below for why `CRON_SECRET` is effectively required, not just
optional, once deployed). Next.js/Vercel's request-driven model doesn't have
a natural place for an always-on `setInterval`-style scheduler to live, and
building a fake one for local dev would be misleading about how this
actually runs in production.

### PATCH `/api/questions/:id` — approve/reject

Body: `{ status: "approved" | "archived" }`. 404 if the question doesn't
exist, 400 on any other status value. This is the only mutation the review
page needs — "reject" maps to `ARCHIVED` (the third status the schema
already had, previously unused) rather than a delete, so a rejected
question's text isn't lost.

### Internal review page — [`app/admin/questions/page.tsx`](app/admin/questions/page.tsx)

Server Component fetching every `PENDING_REVIEW` question (all three
categories) via Prisma directly, grouped by category in the client
component [`components/admin/QuestionReview.tsx`](components/admin/QuestionReview.tsx).
Approve/Reject call the PATCH route above and remove the card from the
local list on success (no full reload). **Not linked in `NavTabs`** —
reachable only at `/admin/questions` by direct URL. Before Phase 7 that URL
obscurity was the *only* protection this page had; it now sits behind
Clerk's auth like every other page (see "Auth" above), so being unlinked is
a secondary, defense-in-depth measure rather than the sole one — but note
that's just "requires *some* Clerk account," not "requires a specific one":
see "Known simplifications" for what that means now that more than one real
account can exist. This is a narrower, earlier piece of the full "admin
review dashboard" noted as a Known Simplification since Phase 3 — that
dashboard is still a later phase; this page only does question moderation.

## Nav shell

[`components/NavTabs.tsx`](components/NavTabs.tsx) renders the four tabs as
plain links (`usePathname` for the active-tab style) in `app/layout.tsx`. As
of Phase 4 all four routes are real: `/` (BEGIN), `/history`, `/settings`,
`/why`. The Phase 5 review page at `/admin/questions` is deliberately
**not** one of these four — see above.

## Testing

[`tests/`](tests) — Vitest, running against a **real** second Postgres
database (`promptperday_test`), not a mocked Prisma client.
`vitest.config.mts`'s `globalSetup` (`tests/globalSetup.ts`) runs `prisma
migrate deploy` then `prisma db seed` against that database once before the
whole suite, so `npm test` works from a clean checkout with no manual setup
step.

`tests/helpers.ts`'s `resetDb()` is the canonical per-test cleanup, called
in every test file's `beforeEach`. As of Phase 5 it does more than clear
session data: it also deletes any `Question` row with `sourceType`
`NEWS_DERIVED` or `AI_GENERATED` (test-inserted; the seed is exclusively
`CURATED`) and any `Category` outside the three seeded ones (ad hoc
categories a test created, e.g. for an isolated eligibility check). This
grew out of a real bug caught while adding the Phase 5 test files:
`seededCategoryAndQuestion()` (used by `createRawSession()`) originally
picked `where: { enabledByDefault: true }` with no explicit ordering or
name filter, so once a second test file started creating its own
categories, it could nondeterministically resolve to a leftover ad hoc
category from a different file instead of a real seeded one — it now
filters explicitly by the three seeded category names. `vitest.config.mts`
also sets `fileParallelism: false`: all test files share one Postgres
database, so running files in parallel let one file's `resetDb()` delete
rows a concurrently-running file's test was still using — a real,
reproducible failure, not a hypothetical one. `createRawSession()` itself
inserts a `Session` directly via Prisma, bypassing `/start`, so tests can
fabricate specific timer states — e.g. "write phase already ended 90
seconds ago" — without waiting on real time.

[`tests/sessions.test.ts`](tests/sessions.test.ts) covers all five Phase 2
Definition-of-Done cases: prep/write timestamps computed correctly at
start, second same-day submission rejected 409, reroll succeeds once then
rejects any further reroll of either type, grace succeeds once then
rejects a second call, and content saves rejected past the (possibly
grace-extended) deadline.

[`tests/jobs.test.ts`](tests/jobs.test.ts) covers the Phase 5 Definition of
Done's first half: `runNewsQuestionsJob` with a mocked `fetch` (never a
real network call) inserts exactly the headline that passes both the
source allowlist and the keyword denylist, skips the rest, and lands it in
`current events`; `runAiQuestionsJob` with a mocked Anthropic client (a
stub `{ messages: { parse: vi.fn()... } }`, never the real SDK call)
inserts all 10 generated questions into the requested category
(`philosophy` and `personal life` both covered) with `sourceType:
AI_GENERATED`.

[`tests/questionReview.test.ts`](tests/questionReview.test.ts) covers the
second half: approving a `PENDING_REVIEW` question flips it to `APPROVED`
*and* — using an isolated single-question test category so the result is
deterministic rather than probabilistic — confirms `pickQuestion` (the same
selection function `/start` uses) can now return it, where it couldn't
before the approval; rejecting flips it to `ARCHIVED` and confirms it
stays unselectable.

**Phase 8 replaced `tests/auth.test.ts`** (tested the now-deleted
shared-password login route) with two new files, plus a shared mocking
setup:

[`tests/setupClerkMock.ts`](tests/setupClerkMock.ts) (wired in via
`vitest.config.mts`'s `setupFiles`, so it registers before any test file's
own imports run) mocks `@clerk/nextjs/server`'s `auth()`/`currentUser()`
entirely — the officially-documented way to test Clerk-protected code
without a real Clerk project or network access, consistent with this
project's existing rule that tests never hit real external services (same
posture as the news/AI-question jobs' injectable clients). The mock reads
its "current user" from [`tests/clerkMock.ts`](tests/clerkMock.ts)'s
`setMockClerkUserId(id)` / `getMockClerkUserId()` — a plain state module,
deliberately with no `vi.mock` call of its own (hoisting only guarantees a
`vi.mock` call takes effect within the file that contains it, and
`setupFiles` is what gives the actual registration in `setupClerkMock.ts`
its early-enough guarantee). `createTestUser()` in `tests/helpers.ts` also
changed: `User.id` has no DB default anymore (see "Auth" above), so it now
requires an explicit, Clerk-shaped fake id (`user_test_N` by default).

[`tests/dataIsolation.test.ts`](tests/dataIsolation.test.ts) is the direct,
automated proof of Phase 8's core requirement: creates data as one mocked
account, switches the mocked Clerk identity to a second account, and
confirms the second account is refused (and the first account's data is
left untouched) across every ownership-checked route —
`reroll`/`grace`/`content`/`submit`/`entry`-delete (all `404`),
`PATCH /api/users/:id` (`404`), plus `getHistoryEntries` and
`User.currentStreak` never leaking between accounts, and a same-day
`/start` from two different accounts each getting their own session. This
doesn't replace manually verifying two real Clerk accounts in a browser
(see "Phase 8" in the manual-verification list below) — it can't, without
a real Clerk project — but it does mean the isolation *logic* is verified
on every test run, not just once by hand.

[`tests/legacyMigration.test.ts`](tests/legacyMigration.test.ts) covers
`migrateLegacyUser`: the full-success path (sessions/entries/question-history
reassigned, streak and prep duration carried over, legacy row deleted) and
both failure modes (`LegacyUserNotFoundError` when there's nothing to
migrate, `TargetUserNotFoundError` when the target hasn't signed in via
Clerk yet).

`sessions.test.ts` and `streak.test.ts` both gained `setMockClerkUserId(...)`
calls in front of every route-handler call that now checks Clerk auth
(`/start`, and every session `:id` route), plus a couple of new
`404`-on-wrong-account cases in `sessions.test.ts` alongside their existing
Phase 2/6 coverage — see those files directly rather than duplicating their
descriptions here.

`middleware.ts` itself isn't exercised by any of these tests — like the
rest of this suite, they call route handler functions directly rather than
booting a real Next server, and middleware only runs in that real request
pipeline — so the redirect-to-`/sign-in` behavior was instead verified
manually in a real browser (see "Phase 8" in the manual-verification list
below).

All test files call the exported route handler functions directly (e.g.
`POST` from `app/api/sessions/start/route.ts`) with hand-built
`NextRequest` objects rather than booting a real Next server — faster, and
still exercises real Prisma/Postgres underneath.

No automated tests exist yet for the Phase 3/4 UI or the routes added in
those phases (`/submit`, `/entry`, `/api/categories/:id`,
`/api/users/:id`) or the Phase 5 UI (`/admin/questions`, the job-trigger
routes) — those have each been verified via a manual click-through in a
real browser against the dev server instead:

- **Phase 3**: start → reroll → write with toolbar/autosave/grace/
  focus-warning → auto-transition to submission on expiry → submit →
  confirmed `Entry` row content in Postgres → reload confirmed the
  congrats state → separately verified delete returns to the idle state
  and removes the `Entry` row.
- **Phase 4**: toggled categories off in SETTINGS, confirmed via `psql`
  the change persisted, then called `/start` five times in a row and
  confirmed it only ever returned the one still-enabled category;
  confirmed the last-enabled-category guard rejects turning the final one
  off; changed prep duration to 20 in SETTINGS and confirmed the next
  `/start` response's `prepEndsAt` was ~20 minutes out and `writeEndsAt`
  exactly 5 minutes after that; confirmed HISTORY renders the real Phase 3
  entry (correct emoji, green "completed" cell, correct legend count),
  that clicking it opens the entry with formatting intact, that
  copy-to-clipboard succeeds, and that month navigation doesn't falsely
  mark pre-history days as "missed."
- **Phase 5**: inserted fixture `PENDING_REVIEW` rows directly (standing
  in for real job output, since no real `NEWS_API_KEY`/`ANTHROPIC_API_KEY`
  is configured in this environment), visited `/admin/questions`, approved
  one and confirmed the card disappeared and `psql` showed `status =
  approved`, rejected the other and confirmed `status = archived` — the
  "becomes eligible" half of the Definition of Done is proven
  deterministically by the automated test above rather than by a
  probabilistic live `/start` call.
- **Phase 7** (superseded — `/login` and the shared-password flow it
  describes no longer exist, replaced in Phase 8; kept here as an accurate
  record of what was verified at the time): with the dev server running and
  no session cookie, confirmed `/` redirects to `/login`; signed in with the
  wrong password and confirmed an inline "Incorrect password" error with no
  redirect; signed in with the correct `APP_PASSWORD` and confirmed a
  redirect to `/` with the nav bar (and "Log out" button) now visible;
  confirmed HISTORY still rendered correctly while authenticated; clicked
  "Log out" and confirmed it redirected back to `/login`; via `curl`,
  confirmed `/api/debug-sentry` returns `401` with no cookie and `500` (the
  route's intentional throw) with a valid one, and checked the browser
  console for errors with `NEXT_PUBLIC_SENTRY_DSN`/`NEXT_PUBLIC_POSTHOG_KEY`
  unset to confirm both SDKs no-op cleanly rather than crashing the app
  when unconfigured.
- **Phase 8**: with the dev server running and only a syntactically-valid
  *placeholder* Clerk publishable key configured (no real Clerk project —
  see "Deployment" below), visiting `/` correctly redirected through
  Clerk's real hosted handshake flow (`https://placeholder-app.clerk.accounts.dev/v1/client/handshake?...`),
  which Clerk's own servers then correctly rejected with a clear
  `"host_invalid"`/`"Invalid host"` JSON error — proving `middleware.ts` and
  `<ClerkProvider>` are wired correctly and actually talking to Clerk's real
  infrastructure, with the only missing piece being a real Clerk project
  (a human step — see "Deployment"). A genuine end-to-end signup/login/
  data-isolation check with two real accounts needs that real project and
  is the one piece of this phase's Definition of Done left for you to
  confirm; `tests/dataIsolation.test.ts` (above) is the automated proof of
  the isolation *logic* underneath it.

Worth adding real component/route tests for the Phase 3/4 UI in a later
phase — Phase 2, Phase 5's backend logic, and Phase 8's auth/ownership
logic now all have direct coverage.

## Deployment (Phase 7–8)

**What this needs, and who does it:** everything in this section that's
*code* (Sentry/PostHog integration, `vercel.json`, Clerk's auth wiring, the
legacy-migration script) is already built and committed. Everything that's
an *account* — Vercel, a Postgres host, Sentry, PostHog, and now Clerk —
had to be created by a human with actual credentials; an agent can prepare
the code and write the runbook below, but can't sign up for services or
hold API tokens on your behalf. Follow the runbook once per service, then
every future `git push` to the connected branch redeploys automatically via
Vercel's GitHub integration.

### Environment variable checklist

Every variable the app reads, across all eight phases, in one place.
"Local" values already live in `.env`/`.env.test` (gitignored) per the
setup steps above; "Production" values get entered into the Vercel
project's Settings → Environment Variables, not committed anywhere.

| Variable | Phase | Required? | Purpose | Where to get it |
|---|---|---|---|---|
| `DATABASE_URL` | 1 | **Required** | Postgres connection the app queries through Prisma at runtime. | Local: your Homebrew Postgres. Production: Neon's **pooled** connection string (see note below). |
| `DIRECT_DATABASE_URL`-equivalent | 1 | Only when migrating production | Not a schema/env var in this project (see note below) — the **direct** (unpooled) Neon connection string, used only when you personally run `prisma migrate deploy` against production. | Neon dashboard, same project as above. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 8 | **Required** | Client-side Clerk key — `<ClerkProvider>`, `<SignIn/>`/`<SignUp/>`, `<UserButton/>` all need it. Without a *real* one (a syntactically-valid placeholder is enough to build, not to actually authenticate anyone — see "Auth" above), sign-in/sign-up won't work. | Clerk dashboard → your app → API Keys. |
| `CLERK_SECRET_KEY` | 8 | **Required** | Server-side Clerk key — `middleware.ts`'s `clerkMiddleware()`, `auth()`, `currentUser()` all need it. | Same place, same page. |
| `NEWS_API_KEY` | 5 | Optional | News-derived question generation job. | [NewsAPI.org](https://newsapi.org) account. |
| `ANTHROPIC_API_KEY` | 5 | Optional | AI-generated question job. | [console.anthropic.com](https://console.anthropic.com). |
| `CRON_SECRET` | 5 | Optional locally, **effectively required in production** | Bearer-token check on the two `/api/jobs/*` routes (`lib/cronAuth.ts`). Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on its own Cron-triggered requests when this is set — set it, or the two `vercel.json` cron entries hit publicly-guessable, unauthenticated URLs. | Any random string: `openssl rand -base64 24`. |
| `NEXT_PUBLIC_SENTRY_DSN` | 7 | Optional (no-ops if unset) | Where the client/server/edge Sentry SDKs send events. | Sentry project settings → Client Keys (DSN). |
| `SENTRY_DSN` | 7 | Optional | Server/edge-side DSN override; falls back to `NEXT_PUBLIC_SENTRY_DSN` if unset (see `sentry.server.config.ts`/`sentry.edge.config.ts`) — in practice just set the `NEXT_PUBLIC_` one and skip this. | Same as above. |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | 7 | Optional, build-time only | Used by `withSentryConfig` in `next.config.mjs` to upload source maps during the Vercel build, so stack traces in Sentry show real source rather than minified bundles. Skipped silently if unset. | Sentry → Settings → Auth Tokens (needs `project:releases` scope); org/project slugs are in the URL of your Sentry project. |
| `NEXT_PUBLIC_POSTHOG_KEY` | 7 | Optional (no-ops if unset) | PostHog project API key — enables the client-side provider in `components/analytics/PostHogProvider.tsx`. | PostHog → Project Settings → Project API Key. |
| `NEXT_PUBLIC_POSTHOG_HOST` | 7 | Optional | PostHog ingestion host; defaults to `https://us.i.posthog.com` if unset. | PostHog project settings (differs for EU-region or self-hosted instances). |

`AUTH_SECRET`/`APP_PASSWORD` (Phase 7) are gone — deleted along with the
shared-password gate they belonged to (see "Auth" above), not carried
forward as unused leftovers.

**On `DIRECT_DATABASE_URL`:** this project doesn't actually add a second
schema.prisma `directUrl` field for it — that would force every local/test
`.env` file to define a second Postgres URL just to satisfy Prisma's
"env var referenced but undefined" check at `generate`/`migrate` time, for a
distinction (pooled vs. direct) that only matters once you're on a real
pooled host. Simpler to keep `datasource.url` as the single `DATABASE_URL`
it's always been, and handle pooled-vs-direct purely as a *runbook*
instruction (below): use the pooled string for the *deployed app's*
`DATABASE_URL` in Vercel, and the direct string on your own machine
whenever you personally run `prisma migrate deploy` against production.

### Runbook

1. **Push this repo to GitHub** (or GitLab/Bitbucket) — Vercel imports from
   a Git provider, not a local folder. `git remote add origin <url> && git
   push -u origin main`.
2. **Create a Neon project** ([neon.tech](https://neon.tech), free tier is
   plenty at this scale). Copy both connection strings it gives you: the
   **pooled** one (hostname ends in `-pooler`) and the **direct** one.
3. **Run the production migration once, from your own machine**, using the
   *direct* connection string (Prisma Migrate's advisory locks can hang
   over a transaction-mode pooler, which is what the `-pooler` host is):
   ```bash
   DATABASE_URL="<neon-direct-connection-string>" npx prisma migrate deploy
   DATABASE_URL="<neon-direct-connection-string>" npx prisma db seed
   ```
4. **Create a Vercel project**, importing the GitHub repo from step 1.
   Framework preset should auto-detect as Next.js.
5. **Create a Clerk app** ([clerk.com](https://clerk.com)). Copy its
   publishable and secret keys into
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`. If you want
   email+password only (no social providers), turn off whichever social
   connections Clerk enabled by default under
   Configure → SSO Connections — that's the one piece of "skip social
   login" that lives in the Clerk dashboard, not this codebase.
6. **Set every "Required" and any "Optional" env var you want** (see the
   checklist above) in Vercel → Project → Settings → Environment Variables.
   Use the **pooled** Neon connection string for `DATABASE_URL` here
   (serverless functions open many short-lived connections; pooling is
   what makes that not fall over).
7. **Create a Sentry project**, platform "Next.js". Copy the DSN into
   `NEXT_PUBLIC_SENTRY_DSN`; optionally create an auth token
   (Settings → Auth Tokens, `project:releases` scope) for
   `SENTRY_AUTH_TOKEN` plus `SENTRY_ORG`/`SENTRY_PROJECT` so source maps
   upload on build.
8. **Create a PostHog project**. Copy the project API key into
   `NEXT_PUBLIC_POSTHOG_KEY` (and `NEXT_PUBLIC_POSTHOG_HOST` if not on
   PostHog's default US cloud).
9. **Deploy** — either push to the connected branch, or click Deploy in the
   Vercel dashboard. Vercel reads `vercel.json` at the repo root and
   registers the two cron entries automatically (visible under the
   project's Cron Jobs tab after this first deploy).
10. **Sign up for your real account**: visit the deployed URL, it should
    redirect to `/sign-in`; use the "Sign up" link to create your real
    account with your real email. This is also what lazily creates your
    account's `User` row (`getOrCreateUser()` — see "Auth" above).
11. **Migrate your pre-Clerk data**, from your own machine, against
    production (use the **direct**, not pooled, Neon connection string —
    same reasoning as step 3):
    ```bash
    DATABASE_URL="<neon-direct-connection-string>" \
      npx tsx scripts/migrate-legacy-user.ts you@your-real-email.com
    ```
    Confirms in its own output how many sessions/entries/question-history
    rows moved, and what streak/prep-duration got carried over — see
    "Auth" above for exactly what this does and why it's a manual step.
12. **Verify the deployed URL**: signed in as your real account, walk
    BEGIN → write → submit → HISTORY and confirm your pre-migration
    entries appear on their original calendar dates alongside anything new.
13. **Verify data isolation with a second account**: open a private/
    incognito window (so it doesn't share your session), sign up for a
    second real account, and confirm BEGIN starts fresh (no submitted
    entry for today) and HISTORY shows nothing — none of the first
    account's entries, streak, or settings. This is the literal Phase 8
    Definition of Done and needs two real Clerk accounts to check —
    `tests/dataIsolation.test.ts` proves the same isolation logic
    automatically, but can't stand in for actually doing this once by hand.
14. **Verify Sentry**: visit `<your-url>/api/debug-sentry` once (while
    signed in) — it always throws on purpose. Check the Sentry project
    dashboard for the event.
15. **Verify PostHog**: click around the app for a minute, then check the
    PostHog project's Activity/Events view for `$pageview` events.

### Why Vercel Cron gets `GET` handlers, not just `POST`

Vercel Cron Jobs only ever issue a `GET` request to the configured path —
there's no way to configure a different method. The two job-trigger routes
were `POST`-only through Phase 5 (matching "trigger this job" semantics for
a manual `curl` call), so each route now has `export const GET = POST;`
appended (see `app/api/jobs/news-questions/route.ts` and
`app/api/jobs/ai-questions/route.ts`) rather than a separate handler body —
neither route's logic actually depends on the HTTP method, and
`ai-questions`'s body-parsing already falls back to `{}` (hence "run both
categories") on a bodyless request, which is exactly what a `GET` is. The
existing `CRON_SECRET` bearer-token check applies identically to both
verbs, and happens to be exactly the header Vercel's own Cron feature sends
automatically when `CRON_SECRET` is set on the project — no
Vercel-specific code needed for that part.

### Why Sentry uses the classic config files, not `instrumentation.ts`

`@sentry/nextjs` (v10) warns at build time that `sentry.server.config.ts`/
`sentry.edge.config.ts` are deprecated in favor of an `instrumentation.ts`
file's `register()` function, and that `sentry.client.config.ts` should
become `instrumentation-client.ts`. Checked against this project's own
pinned Next version before following that suggestion (per "Working in this
codebase" above): `instrumentation-client.ts` doesn't exist as a Next.js
convention at all until Next 15.3, and `instrumentation.ts` itself needs
`experimental.instrumentationHook: true` on Next 14 (it's only on-by-default
starting Next 15) — neither fits a project that deliberately stays on
Next 14's stable, non-experimental surface (see "Why Next.js 14" above). The
classic per-runtime config files remain fully supported by the SDK — it's a
deprecation warning, not a breaking removal — so this project keeps them and
accepts the three build-time warnings as expected/known rather than opting
into an experimental flag to silence them.

### `/api/debug-sentry` note

[`app/api/debug-sentry/route.ts`](app/api/debug-sentry/route.ts) always
throws, by design, so hitting it once after deploying is how you confirm
Sentry is actually receiving events rather than just failing to error
silently. It's `force-dynamic` (Next's build-time static prerendering pass
would otherwise invoke the handler and fail the whole build on this route's
intentional throw — see the comment in the file) and sits behind Clerk auth
like everything else, so it's not a public-anonymous crash button.

## Known simplifications / not yet built

- **No social login, email-verification customization, or account-settings
  UI** — explicitly out of scope for Phase 8 (see "Auth" above). Clerk's
  default new-app configuration and prebuilt `<SignIn/>`/`<SignUp/>`/
  `<UserButton/>` components are used unmodified; changing an account's
  email, managing connected devices, etc. all go through whatever Clerk's
  own `<UserButton/>` popover happens to expose, not anything built here.
- **Global resources (`Category`, `Question`) still aren't account-scoped**
  — real per-user accounts exist now, but `Category.enabledByDefault` and
  the `Question` pool remain shared across every account (see the
  Category-preferences and admin-review bullets below); Phase 8 added
  ownership checks only to the resources that were already modeled as
  per-user in the schema (`Session`, `Entry`, `User` itself), not a
  redesign of what's shared vs. per-account.
- **The legacy-migration script is single-use and manual** —
  `scripts/migrate-legacy-user.ts` assumes exactly one pre-Clerk default
  user to migrate, identified by its fixed placeholder email; it's not a
  general "merge two accounts" tool, and running it twice against an
  already-migrated (deleted) legacy row correctly fails with
  `LegacyUserNotFoundError` rather than doing anything.
- **Streak is tracked but not yet displayed** — `User.currentStreak` is
  computed and persisted on every submission (see "Streak semantics"), but
  no UI surfaces it yet; HISTORY still shows only the calendar, no streak
  number. `POST /api/sessions/:id/submit` already returns the value in its
  response, so wiring up a display is UI-only.
- **Category preferences are global, not per-account** —
  `Category.enabledByDefault` is a single column on `Category`, toggled
  directly by SETTINGS. This was an acceptable simplification when there
  was only ever one real user; as of Phase 8, with real multi-account
  support, it's a live, real gap — any account's SETTINGS toggle changes
  every other account's daily category pool too. Would need a
  `UserCategoryPreference` join table (and updating `/start`/`/reroll`'s
  category selection to read from it) to fix properly.
- **HISTORY has no pagination or year view** — every submitted session is
  loaded on every page view. Fine at this project's real scale (at most
  one row per day, ever), but would need a bounded query (e.g. by visible
  month, fetched via a small API route instead of loading everything up
  front) if usage patterns change.
- **No content restore on reload during the write phase** — if the page is
  reloaded mid-write, the TipTap editor remounts empty; autosaved content
  is safely in the `Entry` row in Postgres, but `ActiveSessionData` doesn't
  currently carry it back down to prefill the editor. Doesn't affect a
  normal single-sitting click-through, but is a real gap for "connection
  lost mid-write" resilience mentioned in the original spec.
- **No early-submit** — the original spec mentioned users being able to
  submit before the write timer runs out; Phase 3's spec only asked for
  the automatic post-expiry submission screen, so no early-submit button
  exists yet. The `/submit` endpoint itself has no deadline gate, so
  adding the button later is a UI-only change.
- **Review page has no *extra* auth beyond "some Clerk account signed
  in"** — `/admin/questions` sits behind the same Clerk auth as every other
  page (see "Auth" above) but has no admin-role concept: **any**
  authenticated account, not a designated owner, can publish
  AI-generated/news-derived questions straight to the approved pool from
  this page. Harmless while you're the only real account, but a real gap
  the moment a second real account exists — worth calling out separately
  since it can publish content, not just view it. Would need a role/
  permission check (Clerk supports custom roles) before that's safe.
- **Scheduler is now wired up, but only on Vercel** — `vercel.json`'s
  `crons` entries hit `GET /api/jobs/news-questions` and
  `GET /api/jobs/ai-questions` daily once deployed (see "Deployment"
  below). Locally, or on any host other than Vercel, nothing calls them —
  you'd still need a system crontab + `curl` (`POST`, with a
  `CRON_SECRET` bearer token) pointed at them yourself.
- **AI-generated questions have no automated content safeguard** — the
  news path has the keyword denylist; the philosophy/personal-life
  generation path relies entirely on the generation prompt plus your own
  judgment on the review page. There's no automated check on AI-generated
  text before it reaches `PENDING_REVIEW`.
- **The full admin dashboard is still ahead** — `/admin/questions` only
  does question moderation. The broader "review dashboard... for
  moderating questions and general review of systems" described early on
  is still a later phase; this is a narrower slice of it.
