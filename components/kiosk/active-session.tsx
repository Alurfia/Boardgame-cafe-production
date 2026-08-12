"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  ESTIMATE_REFRESH_MS,
  calculateBillableHours,
  calculateFeePerPerson,
  calculateSessionTotal,
  resolveSessionStart,
} from "@/lib/billing"
import { toast } from "sonner"
import { useKioskError } from "./use-kiosk-error"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Clock, DollarSign, ShoppingBag, Plus, Minus, Sparkles, Users } from "lucide-react"
import type { Session, Snack, PricingConfig, SessionSnack } from "@/lib/types"

const supabase = createClient()

interface ActiveSessionProps {
  session: Session
  snacks: Snack[]
  pricing: PricingConfig
  onUpdate: () => void
}

export function ActiveSession({ session, snacks, pricing, onUpdate }: ActiveSessionProps) {
  const [elapsed, setElapsed] = useState({ hours: 0, minutes: 0, seconds: 0 })
  /**
   * A start time in the future, or one that will not parse, would otherwise sit
   * frozen at 00:00 and read as a broken timer rather than a bad check-in time.
   * `active-timer.tsx` flags the same condition on the admin side.
   */
  const [startNotReached, setStartNotReached] = useState(false)
  const [estimatedCost, setEstimatedCost] = useState(0)
  /** The time charge one member owes, snacks excluded. */
  const [feePerPerson, setFeePerPerson] = useState(0)
  const [sessionSnacks, setSessionSnacks] = useState<(SessionSnack & { snack_name: string })[]>([])
  const [addingSnackId, setAddingSnackId] = useState<string | null>(null)
  const { showError, errorDialog } = useKioskError()

  const fetchSessionSnacks = useCallback(async () => {
    const { data } = await supabase
      .from("session_snacks")
      .select("*, snacks(name)")
      .eq("session_id", session.id)

    const mapped = (data ?? []).map((item: Record<string, unknown>) => ({
      ...item,
      snack_name: (item.snacks as { name: string } | null)?.name ?? "Unknown",
    })) as (SessionSnack & { snack_name: string })[]

    setSessionSnacks(mapped)
  }, [session.id])

  useEffect(() => {
    fetchSessionSnacks()

    const channel = supabase
      .channel(`kiosk-snacks-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_snacks",
          filter: `session_id=eq.${session.id}`,
        },
        () => { fetchSessionSnacks() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session.id, fetchSessionSnacks])

  useEffect(() => {
    function update() {
      const started = resolveSessionStart(session).getTime()

      if (Number.isNaN(started)) {
        setStartNotReached(true)
        return
      }

      const diffMs = Date.now() - started
      setStartNotReached(diffMs < 0)
      if (diffMs < 0) return

      const hours = Math.floor(diffMs / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)
      setElapsed({ hours, minutes, seconds })
    }

    function updateCost() {
      const started = resolveSessionStart(session).getTime()
      // The estimate still clamps — nobody is billed for a negative duration —
      // but `update` surfaces the bad timestamp instead of hiding it.
      const diffMs = Number.isNaN(started) ? 0 : Math.max(0, Date.now() - started)

      const billableHours = calculateBillableHours(diffMs, pricing.max_billable_hours)
      const snackTotal = sessionSnacks.reduce(
        (sum, ss) => sum + ss.quantity * Number(ss.price_at_time),
        0
      )

      setEstimatedCost(
        calculateSessionTotal({
          baseFee: session.base_fee,
          hourlyRate: session.hourly_rate,
          billableHours,
          memberCount: session.member_count || 1,
          snackTotal,
        })
      )
      setFeePerPerson(
        calculateFeePerPerson({
          baseFee: session.base_fee,
          hourlyRate: session.hourly_rate,
          billableHours,
        })
      )
    }

    update()
    updateCost()
    const timerInterval = setInterval(update, 1000)
    const costInterval = setInterval(updateCost, ESTIMATE_REFRESH_MS)
    return () => {
      clearInterval(timerInterval)
      clearInterval(costInterval)
    }
  }, [session, sessionSnacks, pricing])

  async function addSnack(snack: Snack) {
    setAddingSnackId(snack.id)
    try {
      const existing = sessionSnacks.find((ss) => ss.snack_id === snack.id)
      if (existing) {
        const { error } = await supabase
          .from("session_snacks")
          .update({ quantity: existing.quantity + 1 })
          .eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("session_snacks").insert({
          session_id: session.id,
          snack_id: snack.id,
          quantity: 1,
          price_at_time: snack.price,
        })
        if (error) throw error
      }
      toast.success(`Added ${snack.name}`)
      fetchSessionSnacks()
      onUpdate()
    } catch {
      showError("Failed to add snack", "Please try again, or let staff know.")
    } finally {
      setAddingSnackId(null)
    }
  }

  async function decrementSnack(ss: SessionSnack & { snack_name: string }) {
    try {
      if (ss.quantity <= 1) {
        const { error } = await supabase
          .from("session_snacks")
          .delete()
          .eq("id", ss.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("session_snacks")
          .update({ quantity: ss.quantity - 1 })
          .eq("id", ss.id)
        if (error) throw error
      }
      fetchSessionSnacks()
      onUpdate()
    } catch {
      showError("Failed to update snack", "Please try again, or let staff know.")
    }
  }

  const snackTotal = sessionSnacks.reduce(
    (sum, ss) => sum + ss.quantity * Number(ss.price_at_time),
    0
  )

  return (
    <div className="flex flex-col gap-4 sm:gap-6 slide-up">
      {/* Session Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative">
          <div className="absolute -inset-2 rounded-full bg-primary/20 blur-lg pulse-dot" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full gradient-primary text-xl font-bold text-primary-foreground shadow-lg sm:h-16 sm:w-16 sm:text-2xl">
            {session.customer_name.charAt(0).toUpperCase()}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Welcome back,</p>
          <h2 className="text-xl font-bold text-foreground sm:text-2xl">
            {session.customer_name}
          </h2>
        </div>
        <Badge className="gap-1.5 border-accent/30 bg-accent/10 px-3 py-1.5 text-accent">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          Session Active
        </Badge>
        <div className="-mt-1 flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-foreground">
          <Users className="h-3.5 w-3.5 text-primary" />
          <span>{session.member_count || 1} member{(session.member_count || 1) > 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Timer + Cost row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Card className="overflow-hidden border-accent/20 shadow-lg">
          <div className="h-1 w-full gradient-accent" />
          <CardContent className="flex flex-col items-center gap-1.5 p-4 sm:gap-2 sm:p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
              <Clock className="h-5 w-5 text-accent sm:h-6 sm:w-6" />
            </div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
              Time Playing
            </p>
            {startNotReached ? (
              <>
                <p className="timer-display text-2xl font-bold tracking-tight text-destructive sm:text-4xl">
                  --:--
                </p>
                <p className="text-center text-[10px] leading-tight text-destructive sm:text-xs">
                  Check-in time looks wrong. Please ask staff.
                </p>
              </>
            ) : (
              <>
                <p className="timer-display text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {String(elapsed.hours).padStart(2, "0")}:
                  {String(elapsed.minutes).padStart(2, "0")}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  :{String(elapsed.seconds).padStart(2, "0")}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Per-person time charge, snacks excluded */}
        <Card className="overflow-hidden border-primary/20 shadow-lg">
          <div className="h-1 w-full gradient-primary" />
          <CardContent className="flex flex-col items-center gap-1.5 p-4 sm:gap-2 sm:p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
            </div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
              Per Person
            </p>
            <p className="timer-display text-2xl font-bold text-foreground sm:text-4xl">
              ฿{feePerPerson.toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground sm:text-xs">
              Snacks not included
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-lg">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground sm:text-sm">Est. Total</p>
              <p className="text-[10px] text-muted-foreground sm:text-xs">
                ฿{feePerPerson.toFixed(2)} × {session.member_count || 1} member
                {(session.member_count || 1) > 1 ? "s" : ""}
                {snackTotal > 0 ? ` + ฿${snackTotal.toFixed(2)} snacks` : " — no snacks yet"}
              </p>
            </div>
          </div>
          <p className="timer-display text-lg font-bold text-primary sm:text-xl">
            ฿{estimatedCost.toFixed(2)}
          </p>
        </CardContent>
      </Card>

      {/* Ordered Snacks */}
      {sessionSnacks.length > 0 && (
        <Card className="border-border/50 shadow-lg">
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm text-foreground sm:text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 sm:h-8 sm:w-8">
                <ShoppingBag className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
              </div>
              Your Order
              {sessionSnacks.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {sessionSnacks.reduce((sum, ss) => sum + ss.quantity, 0)} items
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {sessionSnacks.map((ss) => (
                <div
                  key={ss.id}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-secondary/30 px-3 py-2.5 transition-colors hover:bg-secondary/50"
                >
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-foreground sm:text-sm">{ss.snack_name}</p>
                    <p className="text-[10px] text-muted-foreground sm:text-xs">
                      ฿{Number(ss.price_at_time).toFixed(2)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 border-border/50 bg-background transition-colors hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-8"
                      onClick={() => decrementSnack(ss)}
                    >
                      <Minus className="h-3 w-3" />
                      <span className="sr-only">Decrease quantity</span>
                    </Button>
                    <span className="w-6 text-center font-mono text-xs font-bold text-foreground sm:w-7 sm:text-sm">
                      {ss.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 border-border/50 bg-background transition-colors hover:bg-accent/10 hover:text-accent sm:h-8 sm:w-8"
                      onClick={() => {
                        const snack = snacks.find(s => s.id === ss.snack_id)
                        if (snack) addSnack(snack)
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      <span className="sr-only">Increase quantity</span>
                    </Button>
                  </div>
                </div>
              ))}
              <Separator className="my-1" />
              <div className="flex justify-between px-1">
                <span className="text-xs font-medium text-muted-foreground sm:text-sm">Snack Total</span>
                <span className="font-mono text-xs font-bold text-primary sm:text-sm">
                  ฿{snackTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Snack Menu */}
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-sm text-foreground sm:text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg gradient-accent text-accent-foreground shadow-sm sm:h-8 sm:w-8">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            Order Snacks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            {snacks.map((snack) => {
              const ordered = sessionSnacks.find((ss) => ss.snack_id === snack.id)
              return (
                <button
                  key={snack.id}
                  onClick={() => addSnack(snack)}
                  disabled={addingSnackId === snack.id}
                  className="relative flex flex-col items-center gap-1.5 rounded-xl border border-border/50 bg-card p-4 text-card-foreground shadow-sm transition-all hover:border-primary/40 hover:shadow-md hover-lift active:scale-[0.98] disabled:opacity-50 sm:p-5"
                >
                  {ordered && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full gradient-primary text-[10px] font-bold text-primary-foreground shadow-sm">
                      {ordered.quantity}
                    </span>
                  )}
                  <span className="text-xs font-semibold text-foreground sm:text-sm">{snack.name}</span>
                  <span className="font-mono text-[10px] font-medium text-primary sm:text-xs">
                    ฿{Number(snack.price).toFixed(2)}
                  </span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {errorDialog}
    </div>
  )
}
