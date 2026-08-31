# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # next dev --turbo
pnpm build      # next build
pnpm start      # serve production build
npx tsc --noEmit  # the only real type check — see warning below
```

There is no test suite, and `pnpm lint` is broken (`next lint` with no ESLint dependency or config installed). Don't fabricate either.

`next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so **`pnpm build` passes with type errors**. Run `npx tsc --noEmit` after TypeScript changes.

Both `pnpm-lock.yaml` and `package-lock.json` are committed; `package.json` carries a `pnpm.overrides` block pinning React 19 types, so prefer pnpm.

## Data modes

The app runs against either a real Supabase project or a local JSON database, chosen by `NEXT_PUBLIC_DATA_MODE` (see [lib/data-mode.ts](lib/data-mode.ts)):

- `db` — Supabase. Needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. Both are public/anon; there is no service-role key anywhere, and no auth.
- `json` — the mock API under `/api/mock`, backed by `data/mock-db.json` (gitignored, seeded from [lib/mock/seed.ts](lib/mock/seed.ts) on first use). No Supabase project required.

Unset, the mode resolves to `db` when a Supabase URL is configured and `json` when it is not — so a clean checkout runs with an empty `.env.local`.

**The switch lives entirely in [lib/supabase/client.ts](lib/supabase/client.ts) and [lib/supabase/server.ts](lib/supabase/server.ts).** In `json` mode they return a stand-in ([lib/mock/](lib/mock/)) that reimplements the slice of the `supabase-js` surface this app uses — `select/insert/update/delete`, `eq`, `ilike`, `order`, `limit`, `single`, `maybeSingle`, embedded selects like `"*, snacks(name)"`, `rpc()`, and `channel().on("postgres_changes", …)`. Components call `createClient()` and cannot tell the difference; **do not** import from `lib/mock/` in a component. If a component starts using a Supabase method the shim lacks, add it to [lib/mock/query-builder.ts](lib/mock/query-builder.ts) and [lib/mock/store.ts](lib/mock/store.ts).

`PRIVATE_TABLES` in [lib/mock/types.ts](lib/mock/types.ts) marks tables the anon key cannot reach; `runQuery` returns `42501` for them, mirroring RLS-with-no-policy. `app_users` is the only one. Database functions live in `runRpc` and are exposed at `/api/mock/rpc/<fn>`.

The mock store mirrors the constraints in `scripts/`, including the active-name unique index (error code `23505`), foreign keys with cascading delete, and the `used_minutes` range check — so error-handling paths behave the same in both modes. Realtime is emulated by polling per-table revision counters, so a change is visible within `NEXT_PUBLIC_MOCK_POLL_MS` (default 2s) rather than instantly, and the poller cannot distinguish INSERT from UPDATE from DELETE.

The JSON API is a normal REST surface, useful for inspecting or scripting state, and 404s unless the mode is `json`:

```bash
curl localhost:3000/api/mock/meta                 # revisions + row counts
curl localhost:3000/api/mock/sessions             # any table: snacks, sessions, session_snacks, pricing_config
curl 'localhost:3000/api/mock/snacks?limit=5&select=id,name'
curl -X POST localhost:3000/api/mock/meta -d '{"action":"reset"}'   # re-seed
```

Responses are always a Supabase-shaped `{ data, error }` envelope; constraint violations return HTTP 200 with `error` populated, and only malformed requests use a 4xx.

## Database

Supabase Postgres. Migrations live in [scripts/](scripts/) as numbered `.sql` files applied **manually via the Supabase SQL editor** — no migration tool, no tracking table. A new schema change is a new `NNN_*.sql` file (next: `013_`), and it must be idempotent-friendly (`IF NOT EXISTS`) because they get re-pasted. Schema changes also need mirroring in [lib/mock/store.ts](lib/mock/store.ts) (defaults, required columns, constraints) and [lib/mock/seed.ts](lib/mock/seed.ts), or `json` mode drifts from `db` mode.

Tables: `pricing_config` (single row), `snacks`, `sessions`, `session_snacks` (junction), `app_users` (staff accounts). Every table *except `app_users`* has an `USING (true) WITH CHECK (true)` policy — the anon key has full read/write. This is deliberate: the kiosk is unauthenticated. Anything sensitive does not belong in those tables.

`sessions` accreted columns across migrations, so treat `time_in`/`time_out` as authoritative where present and fall back to `started_at`/`ended_at` (`resolveSessionStart` in [lib/billing.ts](lib/billing.ts) is the one implementation of that rule — call it rather than writing `time_in || started_at` again). `used_hours`/`used_minutes` are written only at checkout. `discount_hours` (`011_*.sql`) holds the redeemed discount privileges — see [Billing rule](#billing-rule-the-important-part). `auto_checked_out` (`009_*.sql`) marks the rows the nightly sweep closed — see [Auto checkout](#auto-checkout). `paused_at`/`paused_ms` (`012_*.sql`) stop the clock — see [Pausing the clock](#pausing-the-clock).

`006_unique_active_session_name.sql` adds a *partial* unique index on `lower(btrim(customer_name)) WHERE status = 'active'` — a name may repeat across history, but not among active sessions. Both insert paths ([check-in-form.tsx](components/kiosk/check-in-form.tsx), `createAdminSession` in [sessions-panel.tsx](components/admin/sessions-panel.tsx)) pre-check for duplicates *and* catch Postgres error code `23505`; keep both when adding a third path.

### Admin auth

`007_create_app_users.sql` adds `app_users` (`username`, `password_hash`, `role` in `admin`/`staff`). It is the **one table with RLS enabled and no policy**, plus revoked grants — the anon key cannot read it. Login goes through `verify_login(p_username, p_password)`, a `SECURITY DEFINER` function that bcrypt-compares inside Postgres and returns only `id, username, role`. Never add a policy to `app_users`, and never select `password_hash` from application code.

`json` mode cannot use pgcrypto, so [lib/mock/password.ts](lib/mock/password.ts) hashes with Node `scrypt` in its own `scrypt$salt$hash` format. The formats differ on purpose; only the behaviour is mirrored.

[lib/auth/session.ts](lib/auth/session.ts) mints the signed `admin_session` cookie (HMAC-SHA256 over `{sub, username, role, exp}`, 12h). It is **Edge-safe** — Web Crypto only, no `node:crypto`, no `next/headers` — because [proxy.ts](proxy.ts) imports it. Cookie reading for server components lives in [lib/auth/server.ts](lib/auth/server.ts).

`proxy.ts` (Next 16's rename of the `middleware.ts` convention) gates `/admin/*`; the `(dashboard)` layout and page re-check the session rather than trusting it alone. Role decides which tabs [admin-dashboard.tsx](components/admin/admin-dashboard.tsx) renders — staff get sessions + snacks, admin also gets pricing + summary. **This is a UI boundary, not a security boundary**: mutations are still anon-key calls from the browser, so a determined staff member can bypass it. Say so rather than implying otherwise.

`ADMIN_SESSION_SECRET` is optional in dev (insecure fallback) and throws in production.

## Architecture

Two apps sharing one database, both under the App Router:

- `/kiosk` — customer self-service. Check in, watch the timer, order snacks.
- `/admin` — staff dashboard, behind a login. Split into an `app/admin/(dashboard)/` route group (header chrome + session check) and a standalone `app/admin/login/`. Tabs for sessions, snacks, pricing, summary. The summary tab also carries [history-panel.tsx](components/admin/history-panel.tsx), a date-filtered table of past sessions that can edit or delete them; editing recomputes `total_cost` from the session's own snapshotted rates.
- `/` — a static landing page linking to both.

Data flow is the same in both: the `page.tsx` is a server component (`export const dynamic = "force-dynamic"`) that fetches initial rows with [lib/supabase/server.ts](lib/supabase/server.ts), then hands them to a `"use client"` shell ([kiosk-client.tsx](components/kiosk/kiosk-client.tsx), [admin-dashboard.tsx](components/admin/admin-dashboard.tsx)) as SWR `fallbackData`. The shell subscribes to Realtime `postgres_changes` and calls the matching SWR `mutate()` on any event — no revalidation interval. Mutations are direct `supabase.from(...)` calls from client components; there are no server actions. Route handlers are the mock API under `app/api/mock/` (inactive in `db` mode), the login/logout pair under `app/api/admin/`, and the cron endpoint under `app/api/cron/`.

The kiosk has **no login**. A customer's session identity is the `boardGameSessionId` key in `localStorage`; clearing it or switching devices strands the session, which is why the admin panel can create, correct, check out, and delete sessions manually. Deleting relies on `ON DELETE CASCADE` to take the `session_snacks` rows with it.

### Billing rule (the important part)

[lib/billing.ts](lib/billing.ts) is the single source of truth — `calculateBillableHours` and `calculateSessionTotal`. Never inline the arithmetic in a component again; it used to be copy-pasted in four places and drifted.

```
paused         = paused_ms + (paused_at ? now - paused_at : 0)     // 012_*.sql
elapsed        = max(0, now - (time_in ?? started_at) - paused)
counted        = min(elapsed, pricing.max_billable_hours * 60min)  // default cap 5h
chargeable     = max(0, counted - 60min)                           // first hour is free
blocks         = floor(chargeable / 30min) + (chargeable % 30min > 15min ? 1 : 0)
billableHours  = blocks * 0.5                                      // tops out at cap - 1
sessionFee     = (base_fee + hourly_rate * billableHours) * member_count
personHours    = ceil(counted / 60min) * member_count              // privileges the table holds
discount       = min(discount_hours, personHours) * hourly_rate
               capped at sessionFee
total          = sessionFee - discount
               + Σ(session_snacks.quantity * price_at_time)
```

`calculateElapsedMs` is what produces that `elapsed`, and **every view and every bill goes through it** — never subtract two timestamps in a component. Paused time comes off *before* the cap, so it reduces the charge and the privileges together; a table that sat six hours with one paused counts as five either way.

The **first hour carries no hourly charge** — it is covered by the base fee. Time past it is billed in half-hour blocks, where a leftover part-block counts as a full half hour once it passes **15 minutes** and is dropped otherwise. So 0:00–1:15 bills 0h, 1:16–1:45 bills 0.5h, 1:46–2:15 bills 1h.

`max_billable_hours` caps the **whole stay, free hour included** — not the chargeable part. On the default 5 a table is charged as though it sat five hours no matter how long it really stays, so `billableHours` tops out at **4.0**, and one full-price hour is what the base fee buys. Read it as "we count at most 5 hours", which is what the pricing tab already tells staff.

Worked example: check in 12:00, check out 13:18 → 1h18m → 18 minutes past the free hour → billed as 0.5h. With base ฿30 and rate ฿30/hr for one member, that is 30 + 15 = **฿45**. Two members 12:00–18:00 count as 5 hours, not 6: (30 + 30 x 4) x 2 = **฿300**.

One **discount privilege buys off one counted person-hour**, worth the session's own `hourly_rate`. Staff enter the redeemed count at checkout (also on the partial-checkout, add-finished-session and history-edit dialogs, all through `DiscountHoursField`).

The cap is `ceil(countedHours) * member_count` (`calculatePrivilegeHours`) — measured off the **wall clock rather than `billableHours`**, because the free first hour is still an hour a customer sat and played, but stopping at the same `max_billable_hours` the charge does. A **part hour rounds up**: one person 1h40m in holds 2 privileges, not 1. Five people four hours in owe (30 + 30 x 3) x 5 = ฿600 and hold 4 x 5 = 20 privileges at ฿30; redeeming 10 takes ฿300 off. Two people 12:00–18:00 hold 5 x 2 = 10, not 12. This is why `calculateSessionTotal` takes **both** `billableHours` and `elapsedMs` — they measure different things, and `calculateCountedMs` is what reconciles them.

Rounding up means a table can hold more privilege-value than it owes (that 1h40m table holds ฿60 against a ฿45 fee), which is exactly why the discount clamps at the session fee. On whole hours the two land equal — ฿300 of privileges against a ฿300 session fee — because the base fee is the first counted hour's rate.

The discount comes out of the **session fee, base fee included, never out of the snacks**, and stops at zero: a table can wipe its whole time charge and still owe what it ate.

`base_fee` and `hourly_rate` are **snapshotted onto the session row at check-in**, and `price_at_time` onto each `session_snacks` row — editing pricing in the admin panel never reprices existing sessions. On checkout, `total_cost` is computed once and frozen; every historical view reads `session.total_cost` rather than recomputing. Live estimates refresh on `ESTIMATE_REFRESH_MS` (60s) — that only bounds display staleness, never what is charged — while the wall-clock timer ticks every second separately.

### Pausing the clock

Customers leave the table — dinner, a missing game box, waiting on a friend — and none of that should be billed. Before `012_*.sql` the only way to not bill it was to push `time_in` forward, which destroys the record of the real check-in. So a pause is two columns instead: `paused_ms` is the spans that have closed, `paused_at` the one still running (null when the clock moves). `time_in` therefore always means the moment the customer checked in.

Staff toggle it from the Pause/Resume button on an active row in [sessions-panel.tsx](components/admin/sessions-panel.tsx). Resuming is a read-modify-write — bank `now - paused_at` into `paused_ms`, null the marker — so it is guarded with `.eq("paused_at", <the value that was read>)` and reports a conflict when that matches nothing, rather than banking a span someone else already banked.

**Checkout and partial checkout work normally while paused** — no need to resume first. Both close the open span (`paused_at: null`, `paused_ms: <total>`) alongside the frozen `total_cost`, so a closed row always satisfies `time_out - time_in - paused_ms = the time that was billed`, which is exactly what the history views recompute from. A partial checkout snapshots the parent's paused total onto the child and **leaves the parent alone** — still paused if it was paused, still counting from the same `time_in`.

The kiosk shows the stopped state (frozen timer, "Paused" badge) rather than a clock that mysteriously stops. The history edit dialog carries a "เวลาที่หยุด (นาที)" field, because a mistaken pause is otherwise uncorrectable — adjusting `time_in`/`time_out` to compensate would falsify them.

### The business day

The cafe's day does not end at midnight. The last table of the night checks in at 23:30 and the one after it at 01:00, and both belong to the same night's takings, so the day rolls over at **10:00 in `CAFE_TIME_ZONE`** — the same moment the auto-checkout sweep runs, which is why whatever is left over gets closed exactly as the day turns.

A session is counted into the business day it **checked in** on, never the one it checked out on: the table that sat 23:00–01:30 is one of last night's tables, not the first of today's.

[lib/business-day.ts](lib/business-day.ts) is the single source of truth, the way [lib/billing.ts](lib/billing.ts) is for money. `businessDayKey(date)` is the whole rule — shift back by `CAFE_DAY_CUTOFF_HOUR` and take the calendar day — and `sessionBusinessDayKey(session)` applies it to a row's check-in. Everything downstream compares those `YYYY-MM-DD` strings: same day is `===`, a month is `key.slice(0, 7)`, a year is `key.slice(0, 4)`, and `shiftDayKey` walks the axis. **Never compare timestamps with `setHours(0, 0, 0, 0)` in a component** — that reads the *viewer's* midnight, so an admin outside Bangkok saw a different day, which is exactly what this replaced in [history-panel.tsx](components/admin/history-panel.tsx), [summary-panel.tsx](components/admin/summary-panel.tsx) and [sessions-panel.tsx](components/admin/sessions-panel.tsx).

Because history and the summary tiles now bucket the same rows off the same field, **the history table's per-day revenue equals the summary tab's "today"** — they used to read `time_out` and `ended_at` respectively and could disagree.

The timezone is read from `NEXT_PUBLIC_CAFE_TIME_ZONE` first and `CAFE_TIME_ZONE` second, because the latter is server-only and `lib/business-day.ts` is imported by client components. Move the cafe and you set both, plus the cron in [vercel.json](vercel.json).

The filtering all happens in memory over rows already fetched — there is no date predicate in any query, which also keeps `json` mode working, since the mock query builder has no `gte`/`lte`.

### Auto checkout

Customers forget to check out, and there is no logout on the kiosk — the session then stays `active` forever, holding its name against the unique index and keeping the day from settling. [lib/auto-checkout.ts](lib/auto-checkout.ts) sweeps those; [vercel.json](vercel.json) schedules `GET /api/cron/auto-checkout` at `0 3 * * *`, which is **10:00 Asia/Bangkok** because Vercel cron expressions are always UTC. Move the cafe and you move both.

`decideAutoCheckout` closes a session once it has run `AUTO_CHECKOUT_AFTER_HOURS` (default 5) *or* crossed midnight in `CAFE_TIME_ZONE`, whichever lands first. A future or unparseable `time_in` is **skipped and reported**, never billed — the timer views already flag that for a human.

`time_out` is the moment the sweep runs, so the bill covers real elapsed time, capped as always by `max_billable_hours`. **The sweep decides when to stop the clock, never how much to charge** — it calls the same `lib/billing.ts` functions a manual checkout does. Do not grow a second billing path here.

The sweep's own boundary is calendar **midnight**, not the 10:00 business-day cutoff above — they answer different questions. "Has this table been abandoned" is a wall-clock question; the cutoff only decides which day's takings a closed session lands in.

A **paused** session is swept like any other, and deliberately so: `decideAutoCheckout` measures the wall clock, because an unclosed table holds its name against the unique index and keeps the day from settling whether its clock runs or not. Pausing changes what a session is *charged*, never when it is *due to close*. The sweep closes the open pause span the way a manual checkout does.

Swept rows carry `auto_checked_out = true` (`009_*.sql`) and render an **Auto** badge in [sessions-panel.tsx](components/admin/sessions-panel.tsx) and [history-panel.tsx](components/admin/history-panel.tsx), flagging a total no person confirmed; saving from the history edit dialog clears it. The update filters on `status = 'active'` as well as the id, so a re-run — or a race with a staff checkout — cannot re-bill a closed session.

`CRON_SECRET` gates the endpoint (Vercel sends it as `Authorization: Bearer …`); an admin cookie also passes, so staff can sweep early. Unset, the route is open in dev and closed in production.

## UI conventions

shadcn/ui (`components/ui/`, [components.json](components.json), `@/*` path alias) with Radix primitives, Tailwind, `sonner` for toasts, `recharts` in the summary panel. `components/ui/` is generated — regenerate via the shadcn CLI rather than hand-editing.

The app is **hard-locked to dark mode** (`<html className="dark">` in [app/layout.tsx](app/layout.tsx)); `next-themes` and `components/theme-provider.tsx` are present but unused. Custom utility classes used throughout (`gradient-primary`, `gradient-accent`, `mesh-gradient`, `glass`, `dot-pattern`, `timer-display`, `hover-lift`, `slide-up`, `float`, `twinkle`) are defined in [app/globals.css](app/globals.css), not in the Tailwind config.

Currency is Thai baht, written as a literal `฿` prefix with `.toFixed(2)` — there is no formatting helper. Admin-facing copy mixes Thai and English; kiosk copy is English.
