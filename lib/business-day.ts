/**
 * The cafe's business day.
 *
 * A day at the cafe does not end at midnight — the last table of the night
 * checks in at 23:30 and the one after it at 01:00, and both belong to the same
 * night's takings. The day rolls over at 10:00 in the cafe's own timezone, the
 * same moment the auto-checkout sweep runs (`vercel.json`), so the sweep closes
 * whatever is left over exactly as the day turns.
 *
 * A session is counted into the business day it **checked in** on, never the one
 * it checked out on: the table that sat from 23:00 to 01:30 is one of last
 * night's tables, not the first of today's.
 *
 * This module is the single source of truth for that rule. Never compare
 * timestamps with `setHours(0, 0, 0, 0)` in a component again — that reads the
 * *viewer's* midnight, so an admin outside Bangkok saw a different day.
 */

import { resolveSessionStart } from "./billing"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** The cafe's wall clock, used when nothing is configured. */
export const CAFE_TIME_ZONE_DEFAULT = "Asia/Bangkok"

/** The hour a business day starts, in the cafe's timezone. */
export const CAFE_DAY_CUTOFF_HOUR = 10

/**
 * The cafe's timezone. `CAFE_TIME_ZONE` is server-only (`lib/auto-checkout.ts`
 * reads it), so a browser bundle can only see the `NEXT_PUBLIC_` twin — set both
 * if you move the cafe, or the admin panel and the sweep disagree.
 */
export function getCafeTimeZone(): string {
  return (
    process.env.NEXT_PUBLIC_CAFE_TIME_ZONE?.trim() ||
    process.env.CAFE_TIME_ZONE?.trim() ||
    CAFE_TIME_ZONE_DEFAULT
  )
}

/** `YYYY-MM-DD` on the calendar of `timeZone` — `en-CA` formats dates that way. */
export function zonedDayKey(date: Date, timeZone: string = getCafeTimeZone()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date)
  } catch {
    // An unknown timezone name would otherwise take the whole view down.
    return date.toISOString().slice(0, 10)
  }
}

/**
 * The business day an instant falls in, as `YYYY-MM-DD`.
 *
 * Shifting back by the cutoff and then asking for the calendar day is the whole
 * rule: 27/08 01:00 becomes 26/08 15:00 → `2026-08-26`, while 27/08 10:00
 * becomes 27/08 00:00 → `2026-08-27`.
 */
export function businessDayKey(date: Date, timeZone: string = getCafeTimeZone()): string | null {
  if (Number.isNaN(date.getTime())) return null
  return zonedDayKey(new Date(date.getTime() - CAFE_DAY_CUTOFF_HOUR * HOUR_MS), timeZone)
}

/**
 * The business day a session belongs to, measured from its check-in.
 *
 * `null` for a row whose check-in will not parse — callers skip those rather
 * than piling them onto an `Invalid Date` bucket.
 */
export function sessionBusinessDayKey(
  session: { time_in?: string | null; started_at: string },
  timeZone: string = getCafeTimeZone(),
): string | null {
  return businessDayKey(resolveSessionStart(session), timeZone)
}

/** The business day happening right now. */
export function currentBusinessDayKey(now: Date = new Date()): string {
  return businessDayKey(now) ?? zonedDayKey(new Date())
}

/**
 * `key` moved by whole days. The arithmetic runs on the key's own UTC midnight,
 * which is a pure calendar date with no zone attached — adding 24h to a *local*
 * date would drift across a DST boundary.
 */
export function shiftDayKey(key: string, days: number): string {
  const base = new Date(`${key}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) return key
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** `26/08` from `2026-08-26`, for a chart axis. Re-parsing would re-zone it. */
export function formatDayKeyLabel(key: string): string {
  const [, month, day] = key.split("-")
  return month && day ? `${day}/${month}` : key
}

/** `Aug 26` from `2026-08-26`, for a month axis. */
export function formatMonthKeyLabel(key: string): string {
  const [year, month] = key.split("-")
  const date = new Date(`${year}-${month}-01T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return key
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })
}
