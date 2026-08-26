"use client"

import { useState, useEffect } from "react"

import {
  calculateElapsedMs,
  isSessionPaused,
  resolveSessionStart,
  type SessionClock,
} from "@/lib/billing"

const PLACEHOLDER = "--:--:--"

/**
 * The running clock on an active session — counted time, not wall clock, so a
 * paused session sits still. The interval keeps ticking while paused because
 * `calculateElapsedMs` subtracts the open pause span at exactly the rate the
 * clock advances; the number simply stops changing.
 */
export function ActiveTimer({ session }: { session: SessionClock }) {
  const [elapsed, setElapsed] = useState("")
  // A start time in the future would otherwise sit frozen at 00:00:00, which
  // reads as a broken timer rather than a bad check-in time.
  const [notStarted, setNotStarted] = useState(false)

  const paused = isSessionPaused(session)

  useEffect(() => {
    function update() {
      const started = resolveSessionStart(session).getTime()

      if (Number.isNaN(started)) {
        setNotStarted(true)
        setElapsed(PLACEHOLDER)
        return
      }

      // Measured against the raw clock: a paused session has counted zero, and
      // a future check-in has too, but only one of them is a mistake.
      setNotStarted(Date.now() - started < 0)

      const clamped = calculateElapsedMs(session)
      const hours = Math.floor(clamped / (1000 * 60 * 60))
      const minutes = Math.floor((clamped % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((clamped % (1000 * 60)) / 1000)
      setElapsed(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      )
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [session])

  if (notStarted) {
    return (
      <span
        title="Time in is in the future, so nothing is being counted yet. Check the date on this session."
        className="inline-flex rounded-md bg-destructive/10 px-2 py-0.5 font-mono text-xs font-bold text-destructive sm:text-sm"
      >
        {PLACEHOLDER}
      </span>
    )
  }

  return (
    <span
      title={paused ? "หยุดเวลาอยู่ — ยอดไม่เพิ่มขึ้นจนกว่าจะกด Resume" : undefined}
      className={
        paused
          ? "inline-flex rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold text-muted-foreground sm:text-sm"
          : "inline-flex rounded-md bg-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-accent sm:text-sm"
      }
    >
      {elapsed}
    </span>
  )
}
