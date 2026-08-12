import type { SupabaseClient } from "@supabase/supabase-js"

import {
  DEFAULT_MAX_BILLABLE_HOURS,
  calculateBillableHours,
  calculateSessionTotal,
  resolveSessionStart,
} from "./billing"
import type { Session } from "./types"

/**
 * Closes sessions a customer walked away from.
 *
 * The kiosk has no logout — a session only ends when someone presses checkout.
 * When nobody does, the row stays `active` forever: the timer keeps running, the
 * customer name stays locked by the partial unique index in
 * `006_unique_active_session_name.sql`, and the day never settles. A cron hits
 * `/api/cron/auto-checkout` every morning and this module does the work.
 *
 * The billing arithmetic is `lib/billing.ts` exactly as a manual checkout uses
 * it — the sweep only decides *when* to stop the clock, never *how much* to
 * charge. `time_out` is the moment the sweep runs, so a forgotten session bills
 * its real elapsed time, capped by `pricing_config.max_billable_hours` like
 * every other session.
 */

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

/**
 * The cafe's wall clock. "Yesterday" has to mean yesterday in Bangkok, not in
 * UTC where the cron actually runs.
 */
export const CAFE_TIME_ZONE = process.env.CAFE_TIME_ZONE?.trim() || "Asia/Bangkok"

/** A session active this long is treated as forgotten. */
export const DEFAULT_AUTO_CHECKOUT_AFTER_HOURS = 5

export function getAutoCheckoutAfterHours(): number {
  const value = Number(process.env.AUTO_CHECKOUT_AFTER_HOURS)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_AUTO_CHECKOUT_AFTER_HOURS
}

/** `YYYY-MM-DD` in the cafe's timezone — `en-CA` formats dates that way. */
function zonedDayKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date)
  } catch {
    // An unknown timezone name would otherwise take the whole sweep down.
    return date.toISOString().slice(0, 10)
  }
}

export type SkipReason =
  | "future-start"
  | "invalid-start"
  | "still-within-threshold"

export type DueReason = "overnight" | "over-threshold"

export type AutoCheckoutDecision =
  | { due: true; reason: DueReason }
  | { due: false; reason: SkipReason }

/**
 * A session is swept once it has run past the threshold, or once it has crossed
 * into a new calendar day in the cafe's timezone — whichever comes first.
 *
 * A start time in the future is left alone: it means someone typed the check-in
 * time wrong, and the admin panel already flags that for a human to correct.
 */
export function decideAutoCheckout(
  session: Pick<Session, "time_in" | "started_at">,
  now: Date,
  afterHours: number = getAutoCheckoutAfterHours(),
  timeZone: string = CAFE_TIME_ZONE,
): AutoCheckoutDecision {
  const start = resolveSessionStart(session)
  if (Number.isNaN(start.getTime())) return { due: false, reason: "invalid-start" }

  const elapsedMs = now.getTime() - start.getTime()
  if (elapsedMs <= 0) return { due: false, reason: "future-start" }
  if (elapsedMs >= afterHours * HOUR_MS) return { due: true, reason: "over-threshold" }
  if (zonedDayKey(start, timeZone) !== zonedDayKey(now, timeZone)) {
    return { due: true, reason: "overnight" }
  }

  return { due: false, reason: "still-within-threshold" }
}

export interface AutoCheckoutClosed {
  id: string
  customerName: string
  reason: "overnight" | "over-threshold"
  usedHours: number
  usedMinutes: number
  billableHours: number
  totalCost: number
}

export interface AutoCheckoutSkipped {
  id: string
  customerName: string
  reason: SkipReason
}

export interface AutoCheckoutFailure {
  id: string
  customerName: string
  message: string
}

export interface AutoCheckoutReport {
  ranAt: string
  timeZone: string
  afterHours: number
  /** Active sessions considered. */
  scanned: number
  closed: AutoCheckoutClosed[]
  skipped: AutoCheckoutSkipped[]
  failed: AutoCheckoutFailure[]
}

export interface AutoCheckoutOptions {
  now?: Date
  afterHours?: number
  timeZone?: string
}

/**
 * Sweeps every active session and checks out the ones that are due. Safe to run
 * more than once — a session already closed by a person no longer matches the
 * `status = 'active'` filter on the update.
 */
export async function runAutoCheckout(
  supabase: SupabaseClient,
  options: AutoCheckoutOptions = {},
): Promise<AutoCheckoutReport> {
  const now = options.now ?? new Date()
  const afterHours = options.afterHours ?? getAutoCheckoutAfterHours()
  const timeZone = options.timeZone ?? CAFE_TIME_ZONE

  const report: AutoCheckoutReport = {
    ranAt: now.toISOString(),
    timeZone,
    afterHours,
    scanned: 0,
    closed: [],
    skipped: [],
    failed: [],
  }

  const { data: pricingRow, error: pricingError } = await supabase
    .from("pricing_config")
    .select("max_billable_hours")
    .limit(1)
    .maybeSingle()

  if (pricingError) throw new Error(`Failed to read pricing_config: ${pricingError.message}`)

  const maxBillableHours = Number(pricingRow?.max_billable_hours) || DEFAULT_MAX_BILLABLE_HOURS

  const { data: activeRows, error: sessionsError } = await supabase
    .from("sessions")
    .select("*")
    .eq("status", "active")

  if (sessionsError) throw new Error(`Failed to read sessions: ${sessionsError.message}`)

  const activeSessions = (activeRows ?? []) as Session[]
  report.scanned = activeSessions.length
  if (activeSessions.length === 0) return report

  // One read for every session's snacks, grouped in memory — the same shape
  // `history-panel.tsx` uses, and the only filter the mock client supports.
  const { data: snackRows, error: snacksError } = await supabase
    .from("session_snacks")
    .select("session_id, quantity, price_at_time")

  if (snacksError) throw new Error(`Failed to read session_snacks: ${snacksError.message}`)

  const snackTotals = new Map<string, number>()
  for (const row of (snackRows ?? []) as Array<Record<string, unknown>>) {
    const sessionId = String(row.session_id)
    const line = Number(row.quantity) * Number(row.price_at_time)
    if (!Number.isFinite(line)) continue
    snackTotals.set(sessionId, (snackTotals.get(sessionId) ?? 0) + line)
  }

  for (const session of activeSessions) {
    const decision = decideAutoCheckout(session, now, afterHours, timeZone)

    // Switching on the reason rather than on `due` keeps the narrowing working
    // whatever `strict` is set to, and forces a new reason to be handled here.
    switch (decision.reason) {
      case "still-within-threshold":
        continue
      case "future-start":
      case "invalid-start":
        // A broken check-in time is a human's problem — the timer views already
        // flag it, and billing from it would invent a number.
        report.skipped.push({
          id: session.id,
          customerName: session.customer_name,
          reason: decision.reason,
        })
        continue
    }

    const elapsedMs = Math.max(0, now.getTime() - resolveSessionStart(session).getTime())
    const billableHours = calculateBillableHours(elapsedMs, maxBillableHours)
    const usedHours = Math.floor(elapsedMs / HOUR_MS)
    const usedMinutes = Math.floor((elapsedMs % HOUR_MS) / MINUTE_MS)
    const totalCost = calculateSessionTotal({
      baseFee: session.base_fee,
      hourlyRate: session.hourly_rate,
      billableHours,
      memberCount: session.member_count || 1,
      snackTotal: snackTotals.get(session.id) ?? 0,
    })

    const endedAtIso = now.toISOString()
    const { error } = await supabase
      .from("sessions")
      .update({
        status: "checked_out",
        ended_at: endedAtIso,
        time_out: endedAtIso,
        used_hours: usedHours,
        used_minutes: usedMinutes,
        total_cost: totalCost,
        auto_checked_out: true,
      })
      .eq("id", session.id)
      // Someone may have checked this session out between the read and here.
      .eq("status", "active")

    if (error) {
      report.failed.push({
        id: session.id,
        customerName: session.customer_name,
        message: error.message,
      })
      continue
    }

    report.closed.push({
      id: session.id,
      customerName: session.customer_name,
      reason: decision.reason,
      usedHours,
      usedMinutes,
      billableHours,
      totalCost,
    })
  }

  return report
}
