"use client"

import { useState, useEffect, useCallback } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { CheckInForm } from "./check-in-form"
import { ActiveSession } from "./active-session"
import { CheckedOutView } from "./checked-out-view"
import type { PricingConfig, Snack, Session } from "@/lib/types"

const supabase = createClient()

async function fetchSnacks(): Promise<Snack[]> {
  const { data } = await supabase
    .from("snacks")
    .select("*")
    .eq("available", true)
    .order("name")
  return (data ?? []) as Snack[]
}

async function fetchPricing(): Promise<PricingConfig | null> {
  const { data, error } = await supabase
    .from("pricing_config")
    .select("*")
    .limit(1)
    .single()

  if (error) return null
  return (data ?? null) as PricingConfig | null
}

interface KioskClientProps {
  initialSnacks: Snack[]
  initialPricing: PricingConfig | null
}

export function KioskClient({ initialSnacks, initialPricing }: KioskClientProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const { data: snacks, mutate: mutateSnacks } = useSWR(
    "kiosk-snacks",
    fetchSnacks,
    { fallbackData: initialSnacks }
  )

  const { data: pricing } = useSWR<PricingConfig | null>(
    "kiosk-pricing",
    fetchPricing,
    { fallbackData: initialPricing }
  )

  const loadSession = useCallback(async () => {
    const storedId = localStorage.getItem("boardGameSessionId")
    if (storedId) {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", storedId)
        .single()

      if (data) {
        setSession(data as Session)
      } else {
        localStorage.removeItem("boardGameSessionId")
      }
    }
    setIsLoading(false)
  }, [])

  // Restore session from localStorage on mount
  useEffect(() => {
    loadSession()
  }, [loadSession])

  // Supabase Realtime for the current session
  useEffect(() => {
    if (!session) return

    const channel = supabase
      .channel(`kiosk-session-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          setSession(payload.new as Session)
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "snacks" },
        () => { mutateSnacks() }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pricing_config" },
        () => {}
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.id, mutateSnacks, session])

  function handleSessionCreated(newSession: Session) {
    localStorage.setItem("boardGameSessionId", newSession.id)
    setSession(newSession)
  }

  function handleNewSession() {
    localStorage.removeItem("boardGameSessionId")
    setSession(null)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading your session...</p>
        </div>
      </div>
    )
  }

  if (!pricing) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-sm text-center">
          <p className="text-base font-semibold text-foreground">Cannot load pricing</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Check internet/DNS or verify Supabase project URL in environment settings.
          </p>
        </div>
      </div>
    )
  }

  // Checked out state
  if (session?.status === "checked_out") {
    return (
      <CheckedOutView session={session} pricing={pricing} onNewSession={handleNewSession} />
    )
  }

  // Active session
  if (session?.status === "active") {
    return (
      <ActiveSession
        session={session}
        snacks={snacks ?? []}
        pricing={pricing}
        onUpdate={loadSession}
      />
    )
  }

  // No session - show check-in form
  return (
    <CheckInForm
      pricing={pricing}
      onSessionCreated={handleSessionCreated}
    />
  )
}
