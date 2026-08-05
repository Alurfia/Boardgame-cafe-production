"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { calculateBillableHours } from "@/lib/billing"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Clock, ShoppingBag, Sparkles, Users } from "lucide-react"
import type { PricingConfig, Session } from "@/lib/types"

const supabase = createClient()

interface CheckedOutViewProps {
  session: Session
  pricing: PricingConfig
  onNewSession: () => void
}

export function CheckedOutView({ session, pricing, onNewSession }: CheckedOutViewProps) {
  const [snackItems, setSnackItems] = useState<
    { id: string; name: string; quantity: number; priceAtTime: number }[]
  >([])

  const started = new Date(session.started_at)
  const ended = session.ended_at ? new Date(session.ended_at) : new Date()
  const durationMs = Math.max(0, ended.getTime() - started.getTime())
  const hours = Math.floor(durationMs / (1000 * 60 * 60))
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))
  const billableHours = calculateBillableHours(durationMs, pricing.max_billable_hours)
  const memberCount = session.member_count || 1

  useEffect(() => {
    async function loadSnackItems() {
      const { data } = await supabase
        .from("session_snacks")
        .select("id, quantity, price_at_time, snacks(name)")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true })

      const mapped = ((data ?? []) as any[]).map((item) => ({
        id: item.id as string,
        name: (item.snacks as { name?: string } | null)?.name ?? "Unknown",
        quantity: item.quantity as number,
        priceAtTime: Number(item.price_at_time),
      }))

      setSnackItems(mapped)
    }

    loadSnackItems()
  }, [session.id])

  const snackTotal = useMemo(
    () => snackItems.reduce((sum, item) => sum + item.quantity * item.priceAtTime, 0),
    [snackItems]
  )

  const baseFeeTotal = Number(session.base_fee) * memberCount
  const hourlyTotal = Number(session.hourly_rate) * billableHours * memberCount
  const sessionFeeTotal = baseFeeTotal + hourlyTotal
  const perPersonTotal = Number(session.base_fee) + Number(session.hourly_rate) * billableHours
  const displayTotal = Number(session.total_cost ?? baseFeeTotal + hourlyTotal + snackTotal)

  return (
    <div className="flex flex-col items-center gap-6 px-1 pt-6 sm:gap-8 sm:pt-12 slide-up">
      {/* Success icon + message */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative">
          <div className="absolute -inset-3 rounded-full bg-accent/20 blur-xl pulse-dot" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full gradient-accent text-accent-foreground shadow-lg glow-accent sm:h-24 sm:w-24">
            <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-balance text-xl font-bold text-foreground sm:text-2xl">
            Thanks for playing, {session.customer_name}!
          </h2>
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-3 w-3 text-primary" />
            <p className="text-xs font-medium uppercase tracking-widest text-primary">
              Session Complete
            </p>
            <Sparkles className="h-3 w-3 text-primary" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Please pay at the counter.
        </p>
      </div>

      {/* Total Card */}
      <Card className="w-full max-w-sm overflow-hidden border-border/50 shadow-xl">
        <div className="h-1.5 w-full gradient-primary" />
        <CardContent className="flex flex-col items-center gap-5 p-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
              Total Amount
            </p>
            <p className="timer-display text-4xl font-bold text-foreground sm:text-5xl">
              ฿{displayTotal.toFixed(2)}
            </p>
          </div>

          <div className="grid w-full grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/10 p-3 transition-colors hover:bg-accent/15">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20">
                <Clock className="h-4 w-4 text-accent" />
              </div>
              <p className="font-mono text-sm font-bold text-foreground">
                {hours}h {minutes}m
              </p>
              <p className="text-[10px] text-accent">Time Used</p>
            </div>
            <div className="flex flex-col items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 p-3 transition-colors hover:bg-primary/15">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <p className="font-mono text-sm font-bold text-foreground">
                {memberCount}
              </p>
              <p className="text-[10px] text-primary">Members</p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 rounded-xl border border-border/50 bg-secondary/20 p-4 text-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-foreground">
              Cost Breakdown
            </p>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                Session fee (base + hourly)
              </span>
              <span className="font-medium text-foreground">฿{sessionFeeTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Per person</span>
              <span className="font-medium text-foreground">฿{perPersonTotal.toFixed(2)}/person</span>
            </div>

            {snackItems.length > 0 && (
              <>
                <div className="mt-1 flex items-center gap-2 border-t border-border/30 pt-2">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Snacks
                  </p>
                </div>
                {snackItems.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      {item.name} × {item.quantity}
                    </span>
                    <span className="font-medium text-foreground">
                      ฿{(item.quantity * item.priceAtTime).toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border/30 pt-1">
                  <span className="text-muted-foreground">Snack total</span>
                  <span className="font-medium text-foreground">฿{snackTotal.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="w-full max-w-sm border-accent/30 bg-accent/5 shadow-md">
        <CardContent className="p-4 text-center sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">Reminder</p>
          <p className="mt-2 text-sm font-medium text-foreground">
            Don't forget to ask for loyalty points
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            อย่าลืมสะสมแต้ม เพื่อรับส่วนลดและสิทธิพิเศษต่างๆ
          </p>
        </CardContent>
      </Card>

      <Button
        onClick={onNewSession}
        className="h-12 w-full max-w-sm gradient-primary text-base font-semibold text-primary-foreground shadow-lg transition-all hover:opacity-90 hover:shadow-xl sm:h-11 sm:text-sm"
      >
        Start New Session
      </Button>
    </div>
  )
}
