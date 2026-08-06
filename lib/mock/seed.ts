import { randomUUID } from "node:crypto"

import { calculateBillableHours, calculateSessionTotal } from "../billing"
import { hashPassword } from "./password"
import type { Row, TableName } from "./types"

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Mirrors the defaults inserted by `scripts/001_create_tables.sql`. */
const BASE_FEE = 30
const HOURLY_RATE = 30
const MAX_BILLABLE_HOURS = 5

/**
 * Mirrors the starter accounts in `scripts/007_create_app_users.sql`. These are
 * throwaway development credentials for a gitignored local database — the real
 * ones live in Supabase and are changed there.
 */
const SEED_USERS: Array<[username: string, password: string, role: string]> = [
  ["admin", "admin1234", "admin"],
  ["staff", "staff1234", "staff"],
]

const SEED_SNACKS: Array<[string, number]> = [
  ["Coffee", 55],
  ["Tea", 45],
  ["Soda", 15],
  ["Chips", 20],
  ["Cookie", 5],
  ["Sandwich", 25],
]

interface SeedSessionSpec {
  name: string
  members: number
  /** Minutes before "now" the session started. */
  startedMinutesAgo: number
  /** Minutes before "now" the session ended; omit to leave it active. */
  endedMinutesAgo?: number
  /** Snack name -> quantity. */
  snacks?: Record<string, number>
}

const SEED_SESSIONS: SeedSessionSpec[] = [
  // Active long enough that one 30-minute block is already billable.
  { name: "Nina", members: 3, startedMinutesAgo: 105, snacks: { Coffee: 2, Cookie: 1 } },
  // Today.
  { name: "Bank", members: 2, startedMinutesAgo: 300, endedMinutesAgo: 120, snacks: { Soda: 2, Chips: 1 } },
  { name: "Ploy", members: 4, startedMinutesAgo: 480, endedMinutesAgo: 360, snacks: { Tea: 4 } },
  // Earlier days, so the summary charts have something to draw.
  { name: "Somchai", members: 2, startedMinutesAgo: 1440 + 240, endedMinutesAgo: 1440 + 60, snacks: { Sandwich: 2 } },
  { name: "Mook", members: 5, startedMinutesAgo: 5 * 1440 + 300, endedMinutesAgo: 5 * 1440, snacks: { Coffee: 3, Chips: 2 } },
  { name: "Ken", members: 1, startedMinutesAgo: 20 * 1440 + 150, endedMinutesAgo: 20 * 1440 },
]

/**
 * Builds a fresh database. Timestamps are relative to `now` so the seed always
 * looks recent, whenever it is first generated.
 */
export function createSeed(now: number = Date.now()): Record<TableName, Row[]> {
  const iso = (ms: number) => new Date(ms).toISOString()

  const pricing_config: Row[] = [
    {
      id: randomUUID(),
      base_fee: BASE_FEE,
      hourly_rate: HOURLY_RATE,
      max_billable_hours: MAX_BILLABLE_HOURS,
      created_at: iso(now - 30 * DAY),
      updated_at: iso(now - 30 * DAY),
    },
  ]

  const app_users: Row[] = SEED_USERS.map(([username, password, role]) => ({
    id: randomUUID(),
    username,
    password_hash: hashPassword(password),
    role,
    is_active: true,
    created_at: iso(now - 30 * DAY),
    updated_at: iso(now - 30 * DAY),
  }))

  const snacks: Row[] = SEED_SNACKS.map(([name, price]) => ({
    id: randomUUID(),
    name,
    price,
    available: true,
    created_at: iso(now - 30 * DAY),
  }))

  const snackByName = new Map(snacks.map((snack) => [snack.name as string, snack]))

  const sessions: Row[] = []
  const session_snacks: Row[] = []

  for (const spec of SEED_SESSIONS) {
    const startedAt = now - spec.startedMinutesAgo * MINUTE
    const endedAt = spec.endedMinutesAgo === undefined ? null : now - spec.endedMinutesAgo * MINUTE
    const sessionId = randomUUID()

    let snackTotal = 0
    for (const [snackName, quantity] of Object.entries(spec.snacks ?? {})) {
      const snack = snackByName.get(snackName)
      if (!snack) continue
      const price = Number(snack.price)
      snackTotal += price * quantity
      session_snacks.push({
        id: randomUUID(),
        session_id: sessionId,
        snack_id: snack.id,
        quantity,
        price_at_time: price,
        created_at: iso(startedAt + 10 * MINUTE),
      })
    }

    const session: Row = {
      id: sessionId,
      customer_name: spec.name,
      member_count: spec.members,
      status: endedAt === null ? "active" : "checked_out",
      started_at: iso(startedAt),
      ended_at: endedAt === null ? null : iso(endedAt),
      time_in: iso(startedAt),
      time_out: endedAt === null ? null : iso(endedAt),
      used_hours: 0,
      used_minutes: 0,
      base_fee: BASE_FEE,
      hourly_rate: HOURLY_RATE,
      total_cost: null,
      created_at: iso(startedAt),
    }

    if (endedAt !== null) {
      const elapsedMs = Math.max(0, endedAt - startedAt)
      session.used_hours = Math.floor(elapsedMs / HOUR)
      session.used_minutes = Math.floor((elapsedMs % HOUR) / MINUTE)
      session.total_cost = calculateSessionTotal({
        baseFee: BASE_FEE,
        hourlyRate: HOURLY_RATE,
        billableHours: calculateBillableHours(elapsedMs, MAX_BILLABLE_HOURS),
        memberCount: spec.members,
        snackTotal,
      })
    }

    sessions.push(session)
  }

  return { pricing_config, snacks, sessions, session_snacks, app_users }
}
