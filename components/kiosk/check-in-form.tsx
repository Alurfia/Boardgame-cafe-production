"use client"

import React from "react"
import Image from "next/image"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dice5, UserPlus, DollarSign, Clock, Sparkles, Gamepad2 } from "lucide-react"
import type { PricingConfig, Session } from "@/lib/types"

const supabase = createClient()

interface CheckInFormProps {
  pricing: PricingConfig | null
  onSessionCreated: (session: Session) => void
}

export function CheckInForm({ pricing, onSessionCreated }: CheckInFormProps) {
  const [customerName, setCustomerName] = useState("")
  const [memberCount, setMemberCount] = useState("1")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const parsedMemberCount = parseInt(memberCount, 10)
  const memberCountInvalid = !Number.isFinite(parsedMemberCount) || parsedMemberCount < 1

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault()
    if (!customerName.trim()) {
      toast.error("Please enter your name")
      return
    }

    if (memberCountInvalid) {
      toast.error("Please enter at least 1 member")
      return
    }

    if (!pricing) {
      toast.error("Pricing is unavailable")
      return
    }

    setIsSubmitting(true)
    try {
      const normalizedName = customerName.trim().toLocaleLowerCase()
      const { data: activeNameRows, error: activeNameError } = await supabase
        .from("sessions")
        .select("customer_name")
        .eq("status", "active")

      if (activeNameError) throw activeNameError

      const duplicateActiveName = (activeNameRows ?? []).some(
        (row: { customer_name: string | null }) =>
          (row.customer_name ?? "").trim().toLocaleLowerCase() === normalizedName
      )

      if (duplicateActiveName) {
        toast.error("This name already has an active session", {
          description: "Please select another name.",
        })
        return
      }

      const nowIso = new Date().toISOString()
      const { data, error } = await supabase
        .from("sessions")
        .insert({
          customer_name: customerName.trim(),
          member_count: parsedMemberCount,
          status: "active",
          started_at: nowIso,
          time_in: nowIso,
          base_fee: pricing.base_fee,
          hourly_rate: pricing.hourly_rate,
        })
        .select()
        .single()

      if (error) throw error
      toast.success("Welcome! Your session has started.")
      onSessionCreated(data as Session)
    } catch (error: any) {
      if (error?.code === "23505") {
        toast.error("This name already has an active session", {
          description: "Please select another name.",
        })
        return
      }
      toast.error("Failed to start session. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 px-1 pt-4 sm:gap-10 sm:pt-8 slide-up">
      {/* Welcome header */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative">
          <div className="absolute -inset-3 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 blur-xl" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-lg glow-primary sm:h-20 sm:w-20">
            <Image
              src="/alurfia.jpg"
              alt="Alurfia logo"
              width={80}
              height={80}
              className="h-full w-full rounded-2xl object-cover"
              priority
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-balance text-xl font-bold text-foreground sm:text-3xl">
            Alurfia in shelter
          </h2>
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-3 w-3 text-accent" />
            <p className="text-xs font-medium uppercase tracking-widest text-accent">
              Ready to Play
            </p>
            <Sparkles className="h-3 w-3 text-accent" />
          </div>
        </div>
        <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          Check in to start your gaming session.
        </p>
      </div>

      {/* Pricing info chips */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2.5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
            <DollarSign className="h-3 w-3 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground sm:text-sm">
            ฿{Number(pricing?.base_fee ?? 0).toFixed(2)} <span className="font-normal text-muted-foreground">entry</span>
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2.5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-3 w-3 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground sm:text-sm">
            ฿{Number(pricing?.hourly_rate ?? 0).toFixed(2)} <span className="font-normal text-muted-foreground">/hr</span>
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2.5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-3 w-3 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground sm:text-sm">
            All day ฿150 <span className="font-normal text-muted-foreground">/person</span>
          </span>
        </div>
        <div className="flex w-full max-w-sm flex-wrap items-center justify-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs font-medium text-foreground sm:text-sm">
            <Gamepad2 className="h-3.5 w-3.5 text-accent" />
            Nintendo
          </div>
          <div className="flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs font-medium text-foreground sm:text-sm">
            <Dice5 className="h-3.5 w-3.5 text-accent" />
            Board Game
          </div>
        </div>
      </div>

      {!pricing && (
        <p className="max-w-md text-center text-xs text-destructive">
          Pricing is not available right now. Please try again when connection is restored.
        </p>
      )}

      {/* Check-in card */}
      <Card className="w-full max-w-md overflow-hidden border-border/50 shadow-xl">
        <div className="h-1 w-full gradient-primary" />
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="flex items-center gap-3 text-base text-foreground sm:text-lg">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shadow-sm">
              <UserPlus className="h-5 w-5 text-primary" />
            </div>
            Check In
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Enter your name to get started. You can order snacks anytime during your session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCheckIn} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="customer-name" className="text-sm font-medium">Your Name</Label>
              <Input
                id="customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter your name"
                autoFocus
                autoComplete="off"
                className="h-12 border-border/50 bg-secondary/30 text-base transition-all focus:border-primary/50 focus:bg-background sm:h-11 sm:text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="member-count" className="text-sm font-medium">Number of Members</Label>
              <Input
                id="member-count"
                type="number"
                min="1"
                value={memberCount}
                onChange={(e) => setMemberCount(e.target.value)}
                placeholder="Enter number of members"
                className="h-12 border-border/50 bg-secondary/30 text-base transition-all focus:border-primary/50 focus:bg-background sm:h-11 sm:text-sm"
              />
              {memberCountInvalid && (
                <p className="text-xs text-destructive">Must be at least 1 person</p>
              )}
            </div>
            <p className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
              Note: Please open this page in your browser before starting the session.
            </p>
            <Button
              type="submit"
              disabled={isSubmitting || !pricing}
              className="h-12 w-full gradient-primary text-base font-semibold text-primary-foreground shadow-lg transition-all hover:opacity-90 hover:shadow-xl disabled:opacity-50 sm:h-11 sm:text-sm"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Starting...
                </span>
              ) : (
                "Start Session"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
