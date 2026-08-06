# Boardgame Cafe

A kiosk + staff dashboard for a board game cafe. Customers check themselves in at
a tablet, watch their timer run, and order snacks; staff manage sessions,
pricing, and the menu from an admin panel. Both halves share one database and
update each other live.

Built with Next.js 16 (App Router), React 19, Tailwind + shadcn/ui, and Supabase.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # optional — the app boots fine with no env at all
pnpm dev                     # http://localhost:3000
```

With an empty `.env.local` the app runs in **`json` mode** against a local mock
database, so no Supabase project is needed to try it out.

| Route          | What it is                                           |
| -------------- | ---------------------------------------------------- |
| `/`            | Landing page linking to both apps                    |
| `/kiosk`       | Customer self-service — check in, timer, snacks      |
| `/admin`       | Staff dashboard — sessions, snacks, pricing, summary |
| `/admin/login` | Staff sign-in                                        |

`/admin` needs a login; the kiosk never does. In `json` mode the seeded accounts
are `admin` / `admin1234` and `staff` / `staff1234`.

## Commands

```bash
pnpm dev          # next dev --turbo
pnpm build        # next build
pnpm start        # serve the production build
npx tsc --noEmit  # type check
```

`next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so `pnpm build`
succeeds even with type errors — run `npx tsc --noEmit` after TypeScript
changes. There is no test suite, and `pnpm lint` does not work (no ESLint
dependency or config is installed).

Both `pnpm-lock.yaml` and `package-lock.json` are committed, but `package.json`
carries a `pnpm.overrides` block pinning the React 19 types, so prefer pnpm.

## Data modes

`NEXT_PUBLIC_DATA_MODE` picks where data lives (see [lib/data-mode.ts](lib/data-mode.ts)):

- **`db`** — a real Supabase project. Requires `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **`json`** — the mock API under `/api/mock`, backed by `data/mock-db.json`
  (gitignored, seeded from [lib/mock/seed.ts](lib/mock/seed.ts) on first use).

Unset, the mode resolves to `db` when a Supabase URL is configured and `json`
when it is not.

The switch lives entirely in [lib/supabase/client.ts](lib/supabase/client.ts)
and [lib/supabase/server.ts](lib/supabase/server.ts) — in `json` mode they hand
back a stand-in ([lib/mock/](lib/mock/)) that reimplements the slice of the
`supabase-js` surface this app uses, including `rpc()`. Components call
`createClient()` and cannot tell the difference, so **don't import from
`lib/mock/` in a component**.

The mock store mirrors the real constraints (unique active names, cascading
foreign keys, range checks) so error paths behave the same in both modes.
Realtime is emulated by polling revision counters, so changes land within
`NEXT_PUBLIC_MOCK_POLL_MS` (default 2s) rather than instantly.

In `json` mode the store is also a plain REST surface, handy for inspecting or
scripting state (it 404s in `db` mode):

```bash
curl localhost:3000/api/mock/meta                 # revisions + row counts
curl localhost:3000/api/mock/sessions             # or snacks, session_snacks, pricing_config
curl 'localhost:3000/api/mock/snacks?limit=5&select=id,name'
curl -X POST localhost:3000/api/mock/meta -d '{"action":"reset"}'   # re-seed

# Database functions mirror PostgREST's /rpc/<fn>
curl -X POST localhost:3000/api/mock/rpc/verify_login \
  -H 'Content-Type: application/json' -d '{"p_username":"admin","p_password":"admin1234"}'
```

`app_users` is deliberately *not* served here — it returns `42501`, matching the
RLS-with-no-policy it has in `db` mode.

## Admin authentication

Staff accounts live in `app_users` (`scripts/007_create_app_users.sql`) with one
of two roles:

| Role    | Sessions | Snacks | Pricing | Summary + history |
| ------- | :------: | :----: | :-----: | :---------------: |
| `admin` |    ✅    |   ✅   |   ✅    |        ✅         |
| `staff` |    ✅    |   ✅   |   —     |        —          |

How it fits together:

- `POST /api/admin/login` verifies the credentials and sets `admin_session`, an
  httpOnly cookie holding an HMAC-signed `{ sub, username, role, exp }` payload.
  It expires after 12 hours — one shift.
- [proxy.ts](proxy.ts) gates every `/admin` path on that cookie and redirects to
  `/admin/login`. (Next 16 renamed the `middleware.ts` convention to `proxy.ts`.)
  The dashboard layout and page re-check the session rather than trusting the
  proxy alone.
- The role decides which tabs [admin-dashboard.tsx](components/admin/admin-dashboard.tsx)
  renders. Staff never receive the pricing or summary markup at all.
- Sign out is `POST /api/admin/logout`.

Set `ADMIN_SESSION_SECRET` to a long random string. It is optional in
development (a fixed insecure fallback keeps a clean checkout booting) and
**required in production** — the app throws without it. Rotating it signs
everyone out.

### What this does and does not protect

`app_users` is the one table the anon key cannot reach: RLS is on with **no
policy**, and table grants are revoked. Logins go through `verify_login()`, a
`SECURITY DEFINER` function that compares the bcrypt hash inside Postgres and
returns only the id, username and role — password hashes never cross the wire.

Everything else is unchanged: `sessions`, `snacks`, `pricing_config` and
`session_snacks` still have `USING (true) WITH CHECK (true)` policies, because
the kiosk is unauthenticated and ships the anon key to every browser. **So the
role split is a UI boundary, not a security boundary.** It stops a staff member
from casually changing prices or reading takings; it does not stop someone who
opens devtools and calls Supabase directly. Enforcing roles in the database
would mean moving to Supabase Auth so RLS policies can see who is calling.

### Managing accounts

There is no user-management UI. Add and change accounts from the Supabase SQL
editor — `scripts/007_create_app_users.sql` ends with copy-paste snippets:

```sql
INSERT INTO app_users (username, password_hash, role)
VALUES ('nina', extensions.crypt('their-password', extensions.gen_salt('bf')), 'staff');
```

**Change the two starter passwords before this goes anywhere real.**

## Billing rule

[lib/billing.ts](lib/billing.ts) is the single source of truth — never inline
this arithmetic in a component.

```
elapsed       = now - (time_in ?? started_at)
chargeable    = max(0, elapsed - 60min)                       // first hour is free
blocks        = floor(chargeable / 30min) + (chargeable % 30min > 15min ? 1 : 0)
billableHours = min(blocks * 0.5, pricing.max_billable_hours) // default cap 5
total         = (base_fee + hourly_rate * billableHours) * member_count
              + Σ(session_snacks.quantity * price_at_time)
```

The first hour carries no hourly charge — the base fee covers it. Time past it
bills in half-hour blocks, and a leftover part-block only counts once it passes
15 minutes. So 0:00–1:15 bills 0h, 1:16–1:45 bills 0.5h, 1:46–2:15 bills 1h.

> Check in 12:00, check out 13:18 → 1h18m → 18 minutes past the free hour →
> billed as 0.5h. At base ฿30 and ฿30/hr for one member: 30 + 15 = **฿45**.

`base_fee` and `hourly_rate` are snapshotted onto the session row at check-in,
and `price_at_time` onto each `session_snacks` row — editing pricing never
reprices existing sessions. At checkout `total_cost` is computed once and
frozen; historical views read that value rather than recomputing. Live estimates
refresh every 60s, which bounds display staleness only, never what is charged.

Currency is Thai baht, written as a literal `฿` prefix with `.toFixed(2)`.

## Database

Supabase Postgres. Migrations live in [scripts/](scripts/) as numbered `.sql`
files applied **manually through the Supabase SQL editor** — there is no
migration tool and no tracking table. A schema change is a new `NNN_*.sql` file
(next: `008_`), written idempotently (`IF NOT EXISTS`) because they get
re-pasted. Mirror any change in [lib/mock/store.ts](lib/mock/store.ts) and
[lib/mock/seed.ts](lib/mock/seed.ts) or `json` mode drifts from `db` mode.

Tables: `pricing_config` (single row), `snacks`, `sessions`, `session_snacks`
(junction), `app_users` (staff accounts). Notable details:

- `sessions` accreted columns over several migrations — treat `time_in`/`time_out`
  as authoritative where present and fall back to `started_at`/`ended_at`.
  `used_hours`/`used_minutes` are written only at checkout.
- `006_unique_active_session_name.sql` adds a *partial* unique index on
  `lower(btrim(customer_name)) WHERE status = 'active'`: a name may repeat across
  history but not among active sessions. Both insert paths pre-check for
  duplicates *and* catch Postgres error `23505` — keep both if you add a third.

RLS is enabled and every table *except `app_users`* has an
`USING (true) WITH CHECK (true)` policy, so the anon key has full read/write on
them. This is deliberate — the kiosk is unauthenticated and there is no
service-role key anywhere. **Nothing sensitive belongs in those tables.**
`app_users` is the exception and is reachable only through `verify_login()`; see
[Admin authentication](#admin-authentication).

## Architecture

Each `page.tsx` is a server component (`export const dynamic = "force-dynamic"`)
that fetches initial rows via [lib/supabase/server.ts](lib/supabase/server.ts)
and passes them to a `"use client"` shell
([kiosk-client.tsx](components/kiosk/kiosk-client.tsx),
[admin-dashboard.tsx](components/admin/admin-dashboard.tsx)) as SWR
`fallbackData`. The shell subscribes to Realtime `postgres_changes` and calls
the matching `mutate()` on any event — no revalidation interval. Mutations are
direct `supabase.from(...)` calls from client components; there are no server
actions. The route handlers are the mock API under `app/api/mock/` (inactive in
`db` mode) and the login/logout pair under `app/api/admin/`.

`/admin` is split into a `(dashboard)` route group carrying the header chrome
and session check, so [app/admin/login/page.tsx](app/admin/login/page.tsx)
renders standalone.

The kiosk has **no login**. A customer's session identity is the
`boardGameSessionId` key in `localStorage`; clearing it or switching devices
strands the session, which is why admins can create, correct, check out, and
delete sessions by hand. Deletes rely on `ON DELETE CASCADE` to clear
`session_snacks`.

The admin summary tab also carries
[history-panel.tsx](components/admin/history-panel.tsx), a date-filtered table
of past sessions that can edit or delete them; editing recomputes `total_cost`
from the session's own snapshotted rates.

## UI

shadcn/ui with Radix primitives, Tailwind, `sonner` for toasts, `recharts` in
the summary panel. `components/ui/` is generated — regenerate it with the
shadcn CLI rather than hand-editing.

The app is hard-locked to dark mode (`<html className="dark">` in
[app/layout.tsx](app/layout.tsx)); `next-themes` and
[components/theme-provider.tsx](components/theme-provider.tsx) are present but
unused. Custom utility classes (`gradient-primary`, `gradient-accent`,
`mesh-gradient`, `glass`, `dot-pattern`, `timer-display`, `hover-lift`,
`slide-up`, `float`, `twinkle`) are defined in
[app/globals.css](app/globals.css), not in the Tailwind config.

Admin-facing copy mixes Thai and English; kiosk copy is English.
