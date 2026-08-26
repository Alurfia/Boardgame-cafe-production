/**
 * Session pricing. This module is the single source of truth for the billing
 * rule — components and the mock seed all call into it.
 */

const MINUTE_MS = 60 * 1000
const HALF_HOUR_MS = 30 * MINUTE_MS
const HOUR_MS = 60 * MINUTE_MS

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

/**
 * Where a session's clock starts. `time_in` is authoritative where present and
 * `started_at` is the fallback for rows predating `005_*.sql` — the admin and
 * history views have always resolved it this way, so the kiosk must too or the
 * two disagree after a staff member corrects a check-in time.
 */
export function resolveSessionStart(session: {
  time_in?: string | null
  started_at: string
}): Date {
  return new Date(session.time_in || session.started_at)
}

/**
 * The clock fields a session carries. Split out from `Session` so the billing
 * helpers can be handed a partial row — the auto-checkout sweep and the mock
 * seed both build one without the rest of the columns.
 */
export interface SessionClock {
  time_in?: string | null
  started_at: string
  /** Set while the clock is stopped — `sessions.paused_at` (`012_*.sql`). */
  paused_at?: string | null
  /** Paused spans that have already ended — `sessions.paused_ms` (`012_*.sql`). */
  paused_ms?: number | string | null
}

export function isSessionPaused(session: SessionClock): boolean {
  if (!session.paused_at) return false
  return !Number.isNaN(new Date(session.paused_at).getTime())
}

/**
 * Every millisecond this session has spent stopped, including the span still
 * running at `now`. A pause therefore costs nothing extra to hold: the open
 * span grows at exactly the rate the wall clock does, so the counted time below
 * simply stops moving.
 */
export function calculatePausedMs(session: SessionClock, now: number = Date.now()): number {
  const banked = Number(session.paused_ms)
  const closed = Number.isFinite(banked) && banked > 0 ? banked : 0
  if (!session.paused_at) return closed

  const pausedAt = new Date(session.paused_at).getTime()
  if (Number.isNaN(pausedAt)) return closed

  return closed + Math.max(0, now - pausedAt)
}

/**
 * The wall clock a session has run, minus the time it spent paused. **This is
 * what every view displays and every bill is computed from** — feed it to
 * `calculateBillableHours`, `calculateSessionTotal` and friends rather than
 * subtracting timestamps inline.
 *
 * For a closed session pass its `time_out`: `paused_at` is nulled at checkout,
 * so the result is exactly `time_out - time_in - paused_ms`.
 *
 * A start time that will not parse yields 0. Callers that need to *flag* a
 * broken or future check-in still compare `resolveSessionStart` to the clock
 * themselves — a value clamped at zero cannot tell those two apart.
 */
export function calculateElapsedMs(session: SessionClock, now: number = Date.now()): number {
  const start = resolveSessionStart(session).getTime()
  if (Number.isNaN(start)) return 0

  return Math.max(0, now - start - calculatePausedMs(session, now))
}

function normalizeMaxHours(maxBillableHours: number | null | undefined): number {
  const value = Number(maxBillableHours)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_BILLABLE_HOURS
}

/**
 * How much of a session's wall clock counts at all.
 *
 * `pricing_config.max_billable_hours` caps the **whole** stay, free first hour
 * included — a table that sat six hours on the default cap of 5 is charged, and
 * earns privileges, as though it sat five. Everything downstream measures from
 * this rather than from raw elapsed time.
 */
export function calculateCountedMs(
  elapsedMs: number,
  maxBillableHours?: number | null,
): number {
  return Math.min(Math.max(0, elapsedMs), normalizeMaxHours(maxBillableHours) * HOUR_MS)
}

/**
 * The first hour is free. Time past it is billed in half-hour blocks, where a
 * leftover part-block counts as a full half hour once it passes 15 minutes and
 * is dropped otherwise. The clock stops at `max_billable_hours` of *total*
 * stay, so the hourly charge tops out one hour below that.
 *
 *   0:00–1:15 -> 0.0h      2:16–2:45 -> 1.5h
 *   1:16–1:45 -> 0.5h      2:46–3:15 -> 2.0h
 *   1:46–2:15 -> 1.0h      5:00 and up -> 4.0h  (on the default cap of 5)
 *
 * So 12:00 -> 13:18 is 1h18m: 18 minutes past the free hour, which passes the
 * 15-minute mark and bills as 0.5 hours. And 12:00 -> 18:00 counts as five
 * hours, of which the base fee covers the first: 4.0 billable hours.
 */
export function calculateBillableHours(
  elapsedMs: number,
  maxBillableHours?: number | null,
): number {
  const chargeableMs = Math.max(0, calculateCountedMs(elapsedMs, maxBillableHours) - FREE_PERIOD_MS)
  const wholeBlocks = Math.floor(chargeableMs / HALF_HOUR_MS)
  const remainderMs = chargeableMs - wholeBlocks * HALF_HOUR_MS
  const blocks = wholeBlocks + (remainderMs > ROUND_UP_THRESHOLD_MS ? 1 : 0)

  return blocks * 0.5
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

export interface SessionDiscountInput extends SessionFeeInput {
  memberCount: number
  /**
   * Wall-clock time played. Privileges are capped against this rather than
   * `billableHours`: the free first hour is still an hour a customer sat and
   * played, so it earns a privilege even though it carries no hourly charge.
   * Time past `maxBillableHours` earns nothing, the same way it costs nothing.
   */
  elapsedMs: number
  /** `pricing_config.max_billable_hours` — caps the counted stay. Defaults to 5. */
  maxBillableHours?: number | null
  /** Redeemed privileges, one hour each — `sessions.discount_hours` (`011_*.sql`). */
  discountHours?: number | null
}

export interface SessionTotalInput extends SessionDiscountInput {
  snackTotal?: number
}

/** Unrounded, so the total it feeds stays exact. */
function feePerPerson({ baseFee, hourlyRate, billableHours }: SessionFeeInput): number {
  return Number(baseFee) + Number(hourlyRate) * billableHours
}

function normalizeMembers(memberCount: number): number {
  return memberCount > 0 ? memberCount : 1
}

/** The whole table's time charge, unrounded — snacks and discount excluded. */
function sessionFee({ baseFee, hourlyRate, billableHours, memberCount }: SessionDiscountInput): number {
  return feePerPerson({ baseFee, hourlyRate, billableHours }) * normalizeMembers(memberCount)
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
 * How many hours of a stay each person can redeem against — the counted time
 * with any part hour **rounded up**, because a privilege is a whole hour and a
 * customer who played 1h40m is not going to be told they played one. Measured
 * off the wall clock rather than off `billableHours` (the free first hour was
 * still played), but stopping at the same `max_billable_hours` the charge does.
 */
export function calculatePrivilegeHours(
  elapsedMs: number,
  maxBillableHours?: number | null,
): number {
  return Math.ceil(calculateCountedMs(elapsedMs, maxBillableHours) / HOUR_MS)
}

/**
 * The privileges a table holds: one per person per hour. Five people four hours
 * in hold twenty; two people from 12:00 to 18:00 on the default cap hold
 * 5 x 2 = 10, not 6 x 2 = 12; one person 1h40m in holds 2.
 */
export function calculateMaxDiscountHours(
  elapsedMs: number,
  memberCount: number,
  maxBillableHours?: number | null,
): number {
  return calculatePrivilegeHours(elapsedMs, maxBillableHours) * normalizeMembers(memberCount)
}

/** A non-negative whole number of privileges, never more than the session holds. */
export function normalizeDiscountHours(
  discountHours: number | null | undefined,
  elapsedMs: number,
  memberCount: number,
  maxBillableHours?: number | null,
): number {
  const value = Math.floor(Number(discountHours))
  if (!Number.isFinite(value) || value <= 0) return 0

  return Math.min(value, calculateMaxDiscountHours(elapsedMs, memberCount, maxBillableHours))
}

/**
 * What one privilege is worth — the session's own snapshotted `hourly_rate`.
 * Two members from 12:00 to 18:00 hold 10 privileges at ฿30, which is exactly
 * their ฿300 session fee: redeeming every privilege a table holds always clears
 * its time charge, because the base fee is the first counted hour's rate.
 */
export function calculateDiscountRate({ hourlyRate }: SessionFeeInput): number {
  return Number(hourlyRate)
}

/**
 * `privileges x hourly rate`, taken off the session fee — base fee included,
 * snacks never. A group can wipe out its whole time charge and still owe what
 * it ate, so the discount stops at the session fee rather than going negative.
 */
export function calculateDiscountAmount(input: SessionDiscountInput): number {
  const hours = normalizeDiscountHours(
    input.discountHours,
    input.elapsedMs,
    input.memberCount,
    input.maxBillableHours,
  )
  if (hours === 0) return 0

  return roundCurrency(Math.min(hours * calculateDiscountRate(input), sessionFee(input)))
}

/**
 * `(base fee + hourly rate x billable hours) x members - discount + snacks`
 *
 * With base ฿30, rate ฿30/hr and one member, a 1h18m session bills
 * 30 + (30 x 0.5) = ฿45. Five members four hours in owe (30 + 30 x 3) x 5 =
 * ฿600 and hold 4 x 5 = 20 privileges at ฿30; redeeming 10 takes ฿300 off.
 * Two members from 12:00 to 18:00 count as five hours: (30 + 30 x 4) x 2 =
 * ฿300, against 5 x 2 = 10 privileges. The snacks are never discounted.
 */
export function calculateSessionTotal(input: SessionTotalInput): number {
  return roundCurrency(
    sessionFee(input) - calculateDiscountAmount(input) + (input.snackTotal ?? 0),
  )
}
