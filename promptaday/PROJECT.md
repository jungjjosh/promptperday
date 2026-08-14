# promptperday — Project Reference

This document describes everything built so far (Phases 1–3) in enough detail that a
skilled developer could recreate the project from scratch without guessing at a
decision. It covers the stack, the exact data model and why each field exists, every
API route's contract, the BEGIN tab's UI architecture, and every deliberate
simplification or deviation from the original spec, with the reasoning behind it.

It is a living document — update it as later phases land.

## Product scope (v1 MVP)

promptperday is a single-user, web-first daily writing app. Each day the user gets
exactly one writing prompt (a random category + question), goes through a timed
prep phase and a timed write phase, then submits what they wrote.

**Four tabs:** BEGIN, HISTORY, SETTINGS, WHY? — only BEGIN has real functionality as
of Phase 3; the other three are placeholder pages (see "Not yet built" below).

**Categories (seeded):** current events, philosophy, personal life — all toggleable
per user (the toggle UI doesn't exist yet; the schema supports it via
`Category.enabledByDefault`).

**Explicitly out of scope for v1** (per the original spec): image upload, Google
Docs export, social feed, and any functional Friends/Public visibility (the UI shows
those options but only "For You" is selectable).

### Session rules

- Prep duration is user-configurable: 5 / 10 / 15 / 20 minutes, default 10.
- Write duration is always fixed at 5 minutes, not configurable.
- Both durations are computed once when a session starts (`prep_ends_at`,
  `write_ends_at`) and never recomputed, even if the user's prep-duration setting
  changes mid-session.
- Exactly one reroll per session, spendable on the category **or** the question, not
  both.
- Exactly one 60-second grace extension per session, applied via an explicit button
  during the write phase.
- Only one **submitted** session per local calendar day, where "local" means the
  day is computed in the user's stored IANA timezone, not the server's.
- A session's day-of-record is when it was *started* ("Begin" pressed), not when it
  ends — a session begun at 11:58pm and finished after midnight still counts for the
  earlier day. See "Streak semantics" below; streak logic itself isn't built yet.
- Deleting the current day's in-progress draft lets the user start over the same
  day. Deleting a **past** day's entry (not built yet — will live in HISTORY) does
  *not* retroactively affect the streak: the streak is a running value credited at
  the time a day completes, not something recomputed by scanning history. Streak
  only resets to 0 when a day ends with no submitted entry.

### Streak semantics (confirmed, not yet implemented)

No streak counter exists yet — Phase 3 doesn't touch it. When it's built, it must
be a persisted, independently-maintained value (e.g. `User.currentStreak`), *not*
derived by counting `Entry`/`Session` rows, because of the delete-a-past-entry rule
above: deleting old content must not change a streak that was already earned.

## Tech stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | Next.js, App Router | 14.2.35 | Explicitly requested. `create-next-app@latest` defaults to Next 16/React 19 — pin explicitly if recreating. |
| Language | TypeScript | ^5 | Requested. |
| UI runtime | React / React DOM | 18.3.x | Paired with Next 14; Next 16 would want React 19. |
| ORM | Prisma | 6.19.3 (client + CLI) | See "Why Prisma 6, not 7" below. |
| Database | PostgreSQL | 16 (via Homebrew) | Requested. Any Postgres 14+ should work. |
| Rich text | TipTap | 3.30.1 (`@tiptap/react`, `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-text-style`, `@tiptap/extension-character-count`) | TipTap v3 is current stable; v2-era extension packages (`@tiptap/extension-color`, `@tiptap/extension-font-family`) are now folded into `@tiptap/extension-text-style` — install those separately and you'll get duplicate/conflicting `TextStyle` marks. |
| Tests | Vitest | 4.1.10 | Runs against a real second Postgres database, not mocks — see "Testing" below. |
| Lint | ESLint | 8.57.1 (`eslint-config-next@14`) | Pinned to v8 because `eslint-config-next@14` doesn't support ESLint 9's flat config; `create-next-app` scaffolds ESLint 9 by default. |

### Why Prisma 6, not 7

`prisma init` on a fresh install pulls Prisma 7, which removed the `url` field
from the `datasource` block in `schema.prisma` — Postgres connections now require
a driver adapter (`@prisma/adapter-pg` + `pg`) passed explicitly to the
`PrismaClient` constructor everywhere it's instantiated. That's a real amount of
extra ceremony for no benefit at this project's scale, and it's a very recent
breaking change, so the project is pinned to Prisma 6, which keeps the standard
`DATABASE_URL`-based `new PrismaClient()` pattern most Prisma+Next tutorials and
this project's own route handlers assume.

### Why Next.js 14, not the create-next-app default

Explicitly requested by spec. `create-next-app@latest` at the time of writing
scaffolds Next 16 + React 19; both were downgraded (`npm install next@14 react@18
react-dom@18`), which also required: deleting the v16-only `next.config.ts` in
favor of `next.config.mjs` (v14 doesn't support the `.ts` config format), replacing
the scaffolded `Geist`/`Geist Mono` fonts with `Inter` (Geist isn't available via
`next/font/google` on v14), and removing the `LayoutProps<"/">` typed-routes helper
type (a v16 feature) in favor of a plain `{ children: React.ReactNode }` prop type.

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

# 4. Migrate + seed the dev database
npx prisma migrate dev
npx prisma db seed

# 5. Run it
npm run dev          # http://localhost:3000
npm test              # vitest — migrates/seeds promptperday_test itself, no manual step needed
npm run build          # production build sanity check
```

No `.env.example` exists yet — worth adding in a later phase since `DATABASE_URL`
is the only required variable right now.

## Data model

Full schema lives in [`prisma/schema.prisma`](prisma/schema.prisma). Field names
are camelCase in the Prisma Client API and explicitly `@map`'d to snake_case
columns in Postgres (e.g. `prepDurationMinutes` ↔ `prep_duration_minutes`) to match
the snake_case field names as originally specified while keeping idiomatic
TypeScript on the application side.

### Models, as originally specified (Phase 1)

- **User** — `id, email, timezone, prepDurationMinutes (default 10), createdAt`
- **Category** — `id, name, enabledByDefault`
- **Question** — `id, categoryId, text, sourceType (curated | ai_generated |
  news_derived), status (pending_review | approved | archived), createdAt`
- **Session** — `id, userId, categoryId, questionId, prepEndsAt, writeEndsAt,
  rerollUsed, graceUsed, status (prepping | writing | submitted)`
- **Entry** — `id, sessionId, userId, title, description, visibility, content
  (Json), sources (String[]), createdAt`
- **UserQuestionHistory** — `userId, questionId, shownAt` (composite primary key
  on all three columns — there's no separate `id`, matching the original field
  list exactly; logs every question shown to a user so future selections can
  exclude repeats)

### One field added beyond the original spec: `Session.startedAt`

The original Phase 1 field list for `Session` didn't include a "when did this
begin" timestamp. Phase 2's "one submission per local calendar day" rule and the
confirmed streak rule ("a session begun before midnight counts for that day") both
require knowing the actual begin-time. `prepEndsAt` can't stand in for it: prep
duration is user-configurable (5–20 min) and can cross midnight, so
`localDateKey(prepEndsAt)` and `localDateKey(startTime)` can disagree right at the
day boundary. `startedAt DateTime @default(now())` was added to `Session` and
flagged to the user before implementing it (see conversation history) rather than
silently working around the gap. Migration:
`prisma/migrations/20260814071825_add_session_started_at/`.

### Enums map to the exact string values originally specified

Each enum value carries an explicit `@map(...)` (e.g. `CURATED @map("curated")`)
so the Postgres columns store the lowercase/snake_case strings from the spec
(`curated`, `pending_review`, `for_you`, etc.) while Prisma Client exposes
SCREAMING_CASE TS enum members (`SourceType.CURATED`), which is Prisma's idiom.

### Visibility enum

```prisma
enum Visibility {
  FOR_YOU @map("for_you")
  FRIENDS @map("friends")
  PUBLIC  @map("public")
}
```

Per the user: "For You" **is** the private default — there's no separate "Private"
state. `Entry.visibility` defaults to `FOR_YOU`, and it's the only value the API or
UI will ever actually set in v1 (see `/api/sessions/:id/submit` below).

## API routes

All routes live under `app/api/sessions/`. There is no auth layer yet (see
"No auth in v1" below), so every route trusts whatever `userId` / session `:id` is
passed to it.

### POST `/api/sessions/start`

Body: `{ userId: string }`

1. 404 if the user doesn't exist.
2. 409 (`"Already submitted a prompt today"`) if the user has a `Session` with
   `status = SUBMITTED` whose `startedAt`, converted to the user's stored
   timezone, falls on today's local calendar date.
3. Picks a random `Category` where `enabledByDefault = true`.
4. Picks a random `Question` in that category with `status = APPROVED`, excluding
   any question already in that user's `UserQuestionHistory`. If every question in
   the category has been shown before (realistic after ~10 uses against the seed
   data), falls back to ignoring history rather than erroring — a 10-question seed
   pool would otherwise permanently break the daily flow for a long-running user.
5. Reads `User.prepDurationMinutes` (default 10), computes `prepEndsAt = now +
   prepDurationMinutes`, and `writeEndsAt = prepEndsAt + 5 minutes` — both fixed at
   creation, never recomputed.
6. Creates the `Session` and logs the shown question to `UserQuestionHistory`, in
   one transaction.
7. 201, body: `{ id, category: { id, name }, question: { id, text }, prepEndsAt,
   writeEndsAt }`.

### POST `/api/sessions/:id/reroll`

Body: `{ type: "category" | "question" }`

- 400 if `type` is neither value.
- 404 if the session doesn't exist.
- 409 if the session is already `SUBMITTED`.
- 400 (`"Reroll already used for this session"`) if `rerollUsed` is already true —
  applies regardless of which `type` is requested; there is exactly one reroll
  total, not one per type.
- `type: "category"` picks a new random enabled category (excluding the current
  one, if more than one is enabled) and a new question within it.
- `type: "question"` keeps the current category and picks a new question within
  it, excluding both history and the currently-assigned question.
- Sets `rerollUsed = true`, logs the new question to `UserQuestionHistory`.
- 200, body: `{ id, category, question, rerollUsed: true }`.

### POST `/api/sessions/:id/grace`

- 404 if the session doesn't exist.
- 400 if `graceUsed` is already true.
- 400 if `now > writeEndsAt` (too late to ask for grace).
- Sets `graceUsed = true`.
- 200, body: `{ id, graceUsed: true, effectiveDeadline }` where
  `effectiveDeadline = writeEndsAt + 60s`.

### PATCH `/api/sessions/:id/content`

Body: `{ content: <TipTap JSON> }`

- 404 if the session doesn't exist.
- 403 if `now` is past the effective deadline (`writeEndsAt`, or `writeEndsAt +
  60s` if `graceUsed`).
- Upserts `Entry` by `sessionId` (creating it with default title/description/
  visibility on first call), setting `content`.
- 200, body: `{ id, sessionId, content }`.
- This is the **autosave** endpoint — called client-side every 10s and on editor
  blur during the write phase (see "WriteScreen" below). It intentionally has no
  knowledge of title/description/visibility/sources/final submission.

### POST `/api/sessions/:id/submit` — added in Phase 3, not part of the original four

Body: `{ title?, description?, sources?: string[] }`

- 404 if the session doesn't exist.
- 409 if already `SUBMITTED`.
- Upserts `Entry` (in case autosave never fired — falls back to an empty TipTap
  document for `content` if no prior autosave exists) with the given
  title/description/sources, and forces `visibility = FOR_YOU` regardless of what's
  sent — no other value is functional in v1, so it's silently normalized rather
  than rejected.
- Sets `Session.status = SUBMITTED` in the same transaction.
- 200, body: `{ id, sessionId, status: "submitted" }`.
- **No deadline check** — can technically be called during prep or write, since
  the only UI path that calls it is the submission screen, which only appears
  after the write timer expires. Not gated server-side because nothing in this
  phase's scope exposes an early-submit button; add a guard if that changes.

### DELETE `/api/sessions/:id/entry` — added in Phase 3, not part of the original four

- 404 if no `Entry` exists for that session.
- Deletes the `Entry` row. Does **not** touch the `Session` row.
- 200, body: `{ deleted: true }`.
- This is what "Delete" on the submission screen calls. Because `/start`'s 409
  check only looks at `SUBMITTED` sessions, deleting an unsubmitted draft's entry
  and returning to the idle screen naturally allows a same-day retry — no separate
  "reset" logic needed.
- Designed to also work for a *past* day's entry once HISTORY exists (same route,
  same semantics), without retroactively touching the streak — see "Streak
  semantics" above.

### Why `/submit` and `/entry` exist despite "no new endpoints"

Phase 3 was scoped as "wire the UI to the Phase 2 endpoints, no new endpoints."
But none of the four Phase 2 routes can persist title/description/visibility/
sources or flip `Session.status` to `SUBMITTED` — and `PATCH /content` explicitly
403s once `writeEndsAt` passes, which is exactly when the submission screen
appears. Raised this conflict directly rather than silently picking a side; the
user chose adding two small, single-purpose endpoints over overloading
`PATCH /content` with a status flag and a loosened deadline check.

## No auth in v1

Nothing in the original spec described a login flow — this is a single-user,
personal, local-only app for now. `lib/currentUser.ts` resolves to a lazily
created, single `User` row (`you@promptperday.local`, timezone taken from
`Intl.DateTimeFormat().resolvedOptions().timeZone` at creation time). Every API
route trusts the `userId` / session `:id` it's given with no ownership check. This
is fine for local single-user use and must be replaced before this serves more
than one person or is deployed anywhere reachable by others.

## BEGIN tab UI architecture

Entry point: [`app/page.tsx`](app/page.tsx) — an async Server Component. It:

1. Resolves the default user (`getOrCreateDefaultUser`).
2. Computes today's session state server-side (`getTodaySessionState`, in
   [`lib/todaySession.ts`](lib/todaySession.ts)) — mirrors `/start`'s day-boundary
   logic to return one of `idle` / `submitted` / `active` (with the active
   session's data). This is what makes "reload the page after submitting → see
   the congrats screen" work **without** a dedicated GET API route: the initial
   render is always server-computed from current DB state.
3. Marked `export const dynamic = "force-dynamic"` — required. Without it, Next
   tries to statically prerender `/` at build time, which both reads and can
   *write* (creating the default user) during the build's prerender pass; this
   surfaced as a real bug during Phase 3 (`Unique constraint failed on the fields:
   (email)`, from the prerenderer invoking the page function more than once) and
   is fixed by forcing per-request dynamic rendering.
4. Renders `<BeginFlow>`, a client component, with the server-computed initial
   state as a prop.

### State machine — [`components/begin/BeginFlow.tsx`](components/begin/BeginFlow.tsx)

Phases: `idle → prepping → writing → submission → congrats`. `derivePhase()` turns
the server's `idle`/`submitted`/`active` state into one of these by comparing
`now` against `prepEndsAt` and the effective write deadline — this same
derivation re-runs any time the component mounts, so a mid-session page reload
resumes at the correct phase instead of losing the session or starting a
duplicate one. (`/start` itself has no idempotency — calling it twice in one day
before submitting creates two sessions — so the client must avoid ever calling it
when a resumable session already exists; `getTodaySessionState`'s server-side
resolution is what prevents that.)

Each phase renders one screen component, which owns its own timers/network calls
and reports back up via callback props (`onExpire`, `onReroll`, `onGraceUsed`,
`onSubmit`, `onDelete`) rather than BeginFlow polling anything.

### PrepScreen

Countdown to `prepEndsAt` (client `setInterval`, 1s tick). Reroll is presented as
two buttons ("New category" / "New question") sharing one `rerollUsed` flag —
read as "one reroll button, user picks which to spend it on" rather than a
dropdown/modal, since the spec explicitly frames it as one control covering both
options.

### WriteScreen

The most involved screen. Owns:

- **Countdown** to `writeEndsAt`, or `writeEndsAt + 60s` once `graceUsed` — this
  target is recomputed whenever `session.graceUsed` flips, so the grace extension
  visibly adds 60s to the on-screen timer immediately.
- **TipTap editor** (`useEditor` from `@tiptap/react`) with `StarterKit`,
  `TextStyle`, `Color`, `FontFamily`, `FontSize` (all from
  `@tiptap/extension-text-style` in v3 — see stack table above),
  `CharacterCount`. Toolbar exposes exactly the three controls the spec asked
  for — font size, color, family — as a `<select>`, `<input type="color">`, and
  `<select>` respectively, calling `editor.chain().focus().set…().run()`.
- **Legend**: a native `<details>` element (collapsible for free, no extra state
  needed beyond tracking `open` for styling) showing
  `editor.storage.characterCount.words()` / `.characters()`.
- **Grace button**: calls `POST /grace`; on success, flips local `graceUsed`
  (via `onGraceUsed` up to BeginFlow, which updates the shared session state) —
  does not manage its own extended-deadline math beyond what the countdown
  effect already derives from `graceUsed`.
- **Autosave**: `setInterval` every 10s, plus the TipTap editor's own `onBlur`
  callback, both calling the same `saveDraft()` which PATCHes `/content` with
  `editor.getJSON()`. A `ref` holds the latest JSON (updated on every `onUpdate`)
  so the interval closure never sends stale content. Also fires one best-effort
  save the instant the countdown hits zero, before flipping to the submission
  screen — a last-chance capture of anything typed in the final second, tolerant
  of the save losing the race against the server's own deadline check.
- **Focus-loss message** (Page Visibility API, detection only): tracks a
  `wasHidden` ref across `visibilitychange` events. Because a hidden tab can't
  render anything the user can see, the message only makes sense to show
  *on return* — so it fires when visibility flips back to visible after having
  been hidden, and auto-clears after 6s. This is deliberately **not** enforcement
  (no blocking, no penalty) — matches "detection only" in the spec.

### SubmissionScreen

Local-only form state (title, description, sources list, source-input draft) —
nothing round-trips to the server until Submit or Delete is pressed. Visibility is
three buttons, not a native `<select>`, specifically so "coming soon" can be a
real `title` tooltip on the disabled Friends/Public buttons (native `<option
disabled>` tooltips are unreliable cross-browser). Sources are free-text with no
cap: an "Add" button plus Enter-to-add, rendered as a removable list. Delete and
Submit call the two Phase-3 endpoints and report back via `onDelete`/`onSubmit`.

### CongratsScreen / StartScreen

Static. `StartScreen`'s "Begin" button is the only thing that calls
`POST /start`.

### Styling note

[`components/begin/begin.module.css`](components/begin/begin.module.css) hardcodes
light-background surfaces (buttons, the editor card, form inputs) with an explicit
`color` and `color-scheme: light`. This was a real bug found during click-through
testing: the app shell follows the OS dark-mode preference (`globals.css`), and
without an explicit `color-scheme`, browsers apply *dark* user-agent text color to
form controls sitting on an explicitly-white background — producing invisible
white-on-white button/input text. Setting `color-scheme: light` on those specific
light-surfaced elements fixes it without making the whole app light-mode-only.

## Nav shell and stub tabs

[`components/NavTabs.tsx`](components/NavTabs.tsx) renders the four tabs as plain
links (`usePathname` for the active-tab style) in `app/layout.tsx`. `/history`,
`/settings`, `/why` are placeholder Server Components ("Coming in a later phase")
so the app reads as four tabs now rather than BEGIN being an orphan page; none of
their real functionality is built yet.

## Testing

[`tests/`](tests) — Vitest, running against a **real** second Postgres database
(`promptperday_test`), not a mocked Prisma client. `vitest.config.mts`'s
`globalSetup` (`tests/globalSetup.ts`) runs `prisma migrate deploy` then
`prisma db seed` against that database once before the whole suite, so `npm test`
works from a clean checkout with no manual setup step. `tests/helpers.ts` exposes
`resetDb()` (clears `User`/`Session`/`Entry`/`UserQuestionHistory` between tests,
keeps the seeded `Category`/`Question` rows) and `createRawSession()` (inserts a
`Session` directly via Prisma, bypassing `/start`, so tests can fabricate specific
timer states — e.g. "write phase already ended 90 seconds ago" — without waiting
on real time).

[`tests/sessions.test.ts`](tests/sessions.test.ts) covers all five Phase 2
Definition-of-Done cases: prep/write timestamps computed correctly at start,
second same-day submission rejected 409, reroll succeeds once then rejects any
further reroll of either type, grace succeeds once then rejects a second call,
and content saves rejected past the (possibly grace-extended) deadline. Tests call
the exported route handler functions directly (e.g. `POST` from
`app/api/sessions/start/route.ts`) with hand-built `NextRequest` objects rather
than booting a real Next server — faster, and still exercises real Prisma/Postgres
underneath.

No automated tests exist yet for the Phase 3 UI or the `/submit`/`/entry` routes —
Phase 3 was verified via a manual click-through in a real browser against the dev
server (start → reroll → write with toolbar/autosave/grace/focus-warning →
auto-transition to submission on expiry → submit → confirmed `Entry` row content
in Postgres → reload confirmed the congrats state → separately verified delete
returns to the idle state and removes the `Entry` row). Worth adding component/
route tests for these in a later phase.

## Known simplifications / not yet built

- **No auth** — single hardcoded default user (see above). Required before
  multi-user or public deployment.
- **No streak counter** — rules are confirmed (see "Streak semantics") but no
  field or logic exists yet.
- **HISTORY, SETTINGS, WHY? tabs** are placeholder pages only.
- **No category-preference UI** — `Category.enabledByDefault` exists and
  `/start` respects it, but there's no way to toggle it per user yet (would need
  a `UserCategoryPreference` join table or similar — `enabledByDefault` is
  currently global, not per-user).
- **No content restore on reload during the write phase** — if the page is
  reloaded mid-write, the TipTap editor remounts empty; autosaved content is
  safely in the `Entry` row in Postgres, but `ActiveSessionData` doesn't currently
  carry it back down to prefill the editor. Doesn't affect a normal
  single-sitting click-through, but is a real gap for "connection lost mid-write"
  resilience mentioned in the original spec.
- **No early-submit** — the original spec mentioned users being able to submit
  before the write timer runs out; Phase 3's spec only asked for the automatic
  post-expiry submission screen, so no early-submit button exists yet. The
  `/submit` endpoint itself has no deadline gate, so adding the button later is a
  UI-only change.
- **No moderation/curation pipeline** — per earlier direction, AI/API-sourced
  questions go straight to `status = APPROVED` when that generator is built; the
  `PENDING_REVIEW`/`ARCHIVED` statuses exist on `Question` for the admin review
  dashboard (planned for after all phases) to use, not as a pre-publish gate.
