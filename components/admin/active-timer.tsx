"use client"

import { useState, useEffect } from "react"

const PLACEHOLDER = "--:--:--"

export function ActiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState("")
  // A start time in the future would otherwise sit frozen at 00:00:00, which
  // reads as a broken timer rather than a bad check-in time.
  const [notStarted, setNotStarted] = useState(false)

  useEffect(() => {
    function update() {
      const started = new Date(startedAt).getTime()

      if (Number.isNaN(started)) {
        setNotStarted(true)
        setElapsed(PLACEHOLDER)
        return
      }

      const diffMs = Date.now() - started
      setNotStarted(diffMs < 0)

      const clamped = Math.max(0, diffMs)
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
  }, [startedAt])

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
    <span className="inline-flex rounded-md bg-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-accent sm:text-sm">
      {elapsed}
    </span>
  )
}
