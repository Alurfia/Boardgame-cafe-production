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

**The switch lives entirely in [lib/supabase/client.ts](lib/supabase/client.ts) and [lib/supabase/server.ts](lib/supabase/server.ts).** In `json` mode they return a stand-in ([lib/mock/](lib/mock/)) that reimplements the slice of the `supabase-js` surface this app uses — `select/insert/update/delete`, `eq`, `ilike`, `order`, `limit`, `single`, `maybeSingle`, embedded selects like `"*, snacks(name)"`, and `channel().on("postgres_changes", …)`. Components call `createClient()` and cannot tell the difference; **do not** import from `lib/mock/` in a component. If a component starts using a Supabase method the shim lacks, add it to [lib/mock/query-builder.ts](lib/mock/query-builder.ts) and [lib/mock/store.ts](lib/mock/store.ts).

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

Supabase Postgres. Migrations live in [scripts/](scripts/) as numbered `.sql` files applied **manually via the Supabase SQL editor** — no migration tool, no tracking table. A new schema change is a new `NNN_*.sql` file (next: `007_`), and it must be idempotent-friendly (`IF NOT EXISTS`) because they get re-pasted. Schema changes also need mirroring in [lib/mock/store.ts](lib/mock/store.ts) (defaults, required columns, constraints) and [lib/mock/seed.ts](lib/mock/seed.ts), or `json` mode drifts from `db` mode.

Tables: `pricing_config` (single row), `snacks`, `sessions`, `session_snacks` (junction). RLS is enabled but every table has an `USING (true) WITH CHECK (true)` policy — the anon key has full read/write. This is deliberate: the kiosk is unauthenticated. Anything sensitive does not belong in this database.

`sessions` accreted columns across migrations, so treat `time_in`/`time_out` as authoritative where present and fall back to `started_at`/`ended_at` (`getSessionTimeInDate` in [sessions-panel.tsx](components/admin/sessions-panel.tsx) does this). `used_hours`/`used_minutes` are written only at checkout.

`006_unique_active_session_name.sql` adds a *partial* unique index on `lower(btrim(customer_name)) WHERE status = 'active'` — a name may repeat across history, but not among active sessions. Both insert paths ([check-in-form.tsx](components/kiosk/check-in-form.tsx), `createAdminSession` in [sessions-panel.tsx](components/admin/sessions-panel.tsx)) pre-check for duplicates *and* catch Postgres error code `23505`; keep both when adding a third path.

## Architecture

Two apps sharing one database, both under the App Router:

- `/kiosk` — customer self-service. Check in, watch the timer, order snacks.
- `/admin` — staff dashboard. Tabs for sessions, snacks, pricing, summary. The summary tab also carries [history-panel.tsx](components/admin/history-panel.tsx), a date-filtered table of past sessions that can edit or delete them; editing recomputes `total_cost` from the session's own snapshotted rates.
- `/` — a static landing page linking to both.

Data flow is the same in both: the `page.tsx` is a server component (`export const dynamic = "force-dynamic"`) that fetches initial rows with [lib/supabase/server.ts](lib/supabase/server.ts), then hands them to a `"use client"` shell ([kiosk-client.tsx](components/kiosk/kiosk-client.tsx), [admin-dashboard.tsx](components/admin/admin-dashboard.tsx)) as SWR `fallbackData`. The shell subscribes to Realtime `postgres_changes` and calls the matching SWR `mutate()` on any event — no revalidation interval. Mutations are direct `supabase.from(...)` calls from client components; there are no server actions, and the only route handlers are the mock API under `app/api/mock/` (inactive in `db` mode).

The kiosk has **no login**. A customer's session identity is the `boardGameSessionId` key in `localStorage`; clearing it or switching devices strands the session, which is why the admin panel can create, correct, check out, and delete sessions manually. Deleting relies on `ON DELETE CASCADE` to take the `session_snacks` rows with it.

### Billing rule (the important part)

[lib/billing.ts](lib/billing.ts) is the single source of truth — `calculateBillableHours` and `calculateSessionTotal`. Never inline the arithmetic in a component again; it used to be copy-pasted in four places and drifted.

```
elapsed        = now - (time_in ?? started_at)
chargeable     = max(0, elapsed - 60min)                          // first hour is free
blocks         = floor(chargeable / 30min) + (chargeable % 30min > 15min ? 1 : 0)
billableHours  = min(blocks * 0.5, pricing.max_billable_hours)    // default cap 5
total          = (base_fee + hourly_rate * billableHours) * member_count
               + Σ(session_snacks.quantity * price_at_time)
```

The **first hour carries no hourly charge** — it is covered by the base fee. Time past it is billed in half-hour blocks, where a leftover part-block counts as a full half hour once it passes **15 minutes** and is dropped otherwise. So 0:00–1:15 bills 0h, 1:16–1:45 bills 0.5h, 1:46–2:15 bills 1h.

Worked example: check in 12:00, check out 13:18 → 1h18m → 18 minutes past the free hour → billed as 0.5h. With base ฿30 and rate ฿30/hr for one member, that is 30 + 15 = **฿45**.

`base_fee` and `hourly_rate` are **snapshotted onto the session row at check-in**, and `price_at_time` onto each `session_snacks` row — editing pricing in the admin panel never reprices existing sessions. On checkout, `total_cost` is computed once and frozen; every historical view reads `session.total_cost` rather than recomputing. Live estimates refresh on `ESTIMATE_REFRESH_MS` (60s) — that only bounds display staleness, never what is charged — while the wall-clock timer ticks every second separately.

## UI conventions

shadcn/ui (`components/ui/`, [components.json](components.json), `@/*` path alias) with Radix primitives, Tailwind, `sonner` for toasts, `recharts` in the summary panel. `components/ui/` is generated — regenerate via the shadcn CLI rather than hand-editing.

The app is **hard-locked to dark mode** (`<html className="dark">` in [app/layout.tsx](app/layout.tsx)); `next-themes` and `components/theme-provider.tsx` are present but unused. Custom utility classes used throughout (`gradient-primary`, `gradient-accent`, `mesh-gradient`, `glass`, `dot-pattern`, `timer-display`, `hover-lift`, `slide-up`, `float`, `twinkle`) are defined in [app/globals.css](app/globals.css), not in the Tailwind config.

Currency is Thai baht, written as a literal `฿` prefix with `.toFixed(2)` — there is no formatting helper. Admin-facing copy mixes Thai and English; kiosk copy is English.
