/**
 * Session pricing. This module is the single source of truth for the billing
 * rule — components and the mock seed all call into it.
 */

const MINUTE_MS = 60 * 1000
const HALF_HOUR_MS = 30 * MINUTE_MS

/** A part-block longer than this rounds up to a full half hour. */
export const ROUND_UP_THRESHOLD_MS = 15 * MINUTE_MS

/** The first hour carries no hourly charge — it is covered by the base fee. */
export const FREE_PERIOD_MS = 60 * MINUTE_MS

export const DEFAULT_MAX_BILLABLE_HOURS = 5

/**
 * How often live views recompute an estimate. The billed amount steps every 30
 * minutes (at 1:16, 1:46, 2:16, …), so this only bounds how stale a displayed
 * estimate can be — it does not affect what is charged at checkout.
 */
export const ESTIMATE_REFRESH_MS = 60 * 1000

function normalizeMaxHours(maxBillableHours: number | null | undefined): number {
  const value = Number(maxBillableHours)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_BILLABLE_HOURS
}

/**
 * The first hour is free. Time past it is billed in half-hour blocks, where a
 * leftover part-block counts as a full half hour once it passes 15 minutes and
 * is dropped otherwise. The result is capped by
 * `pricing_config.max_billable_hours`.
 *
 *   0:00–1:15 -> 0.0h      2:16–2:45 -> 1.5h
 *   1:16–1:45 -> 0.5h      2:46–3:15 -> 2.0h
 *   1:46–2:15 -> 1.0h
 *
 * So 12:00 -> 13:18 is 1h18m: 18 minutes past the free hour, which passes the
 * 15-minute mark and bills as 0.5 hours.
 */
export function calculateBillableHours(
  elapsedMs: number,
  maxBillableHours?: number | null,
): number {
  const chargeableMs = Math.max(0, elapsedMs - FREE_PERIOD_MS)
  const wholeBlocks = Math.floor(chargeableMs / HALF_HOUR_MS)
  const remainderMs = chargeableMs - wholeBlocks * HALF_HOUR_MS
  const blocks = wholeBlocks + (remainderMs > ROUND_UP_THRESHOLD_MS ? 1 : 0)

  return Math.min(blocks * 0.5, normalizeMaxHours(maxBillableHours))
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

export interface SessionFeeInput {
  /** Snapshotted on the session row at check-in, so it may arrive as a string. */
  baseFee: number | string
  hourlyRate: number | string
  billableHours: number
}

export interface SessionTotalInput extends SessionFeeInput {
  memberCount: number
  snackTotal?: number
}

/** Unrounded, so the total it feeds stays exact. */
function feePerPerson({ baseFee, hourlyRate, billableHours }: SessionFeeInput): number {
  return Number(baseFee) + Number(hourlyRate) * billableHours
}

/**
 * What one member owes for time alone — `base fee + hourly rate x billable
 * hours`, before snacks and before the member count multiplies it. A ฿90
 * three-member session fee is ฿30 per person.
 */
export function calculateFeePerPerson(input: SessionFeeInput): number {
  return roundCurrency(feePerPerson(input))
}

/**
 * `(base fee + hourly rate x billable hours) x members + snacks`
 *
 * With base ฿30, rate ฿30/hr and one member, a 1h18m session bills
 * 30 + (30 x 0.5) = ฿45.
 */
export function calculateSessionTotal({
  baseFee,
  hourlyRate,
  billableHours,
  memberCount,
  snackTotal = 0,
}: SessionTotalInput): number {
  const members = memberCount > 0 ? memberCount : 1

  return roundCurrency(feePerPerson({ baseFee, hourlyRate, billableHours }) * members + snackTotal)
}
