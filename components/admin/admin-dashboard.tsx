"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SessionsPanel } from "./sessions-panel"
import { SnacksPanel } from "./snacks-panel"
import { PricingPanel } from "./pricing-panel"
import { SummaryPanel } from "./summary-panel"
import { HistoryPanel } from "./history-panel"
import { Clock, Cookie, DollarSign, BarChart3 } from "lucide-react"
import type { PricingConfig, Snack, Session } from "@/lib/types"

const supabase = createClient()

async function fetchSessions(): Promise<Session[]> {
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .order("created_at", { ascending: false })
  return (data ?? []) as Session[]
}

async function fetchSnacks(): Promise<Snack[]> {
  const { data } = await supabase.from("snacks").select("*").order("name")
  return (data ?? []) as Snack[]
}

async function fetchPricing(): Promise<PricingConfig> {
  const { data } = await supabase
    .from("pricing_config")
    .select("*")
    .limit(1)
    .single()
  return data as PricingConfig
}

interface AdminDashboardProps {
  initialSessions: Session[]
  initialSnacks: Snack[]
  initialPricing: PricingConfig
}

export function AdminDashboard({
  initialSessions,
  initialSnacks,
  initialPricing,
}: AdminDashboardProps) {
  const {
    data: sessions,
    mutate: mutateSessions,
  } = useSWR("admin-sessions", fetchSessions, { fallbackData: initialSessions })

  const {
    data: snacks,
    mutate: mutateSnacks,
  } = useSWR("admin-snacks", fetchSnacks, { fallbackData: initialSnacks })

  const {
    data: pricing,
    mutate: mutatePricing,
  } = useSWR("admin-pricing", fetchPricing, { fallbackData: initialPricing })

  const [summaryRefresh, setSummaryRefresh] = useState(0)

  useEffect(() => {
    const channel = supabase
      .channel("admin-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => { mutateSessions() }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "snacks" },
        () => { mutateSnacks() }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_snacks" },
        () => { mutateSessions() }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pricing_config" },
        () => { mutatePricing() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [mutateSessions, mutateSnacks, mutatePricing])

  const activeSessions = sessions?.filter((s) => s.status === "active") ?? []
  const checkedOutSessions = sessions?.filter((s) => s.status === "checked_out") ?? []

  return (
    <Tabs defaultValue="sessions" className="flex flex-col gap-4 sm:gap-6">
      <TabsList className="grid h-auto w-full grid-cols-4 gap-1 bg-secondary/50 p-1 sm:w-fit sm:flex sm:gap-0 sm:p-1">
        <TabsTrigger 
          value="sessions" 
          className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:rounded-md sm:px-4 sm:py-2 sm:text-sm"
        >
          <Clock className="h-3.5 w-3.5" />
          <span>Sessions</span>
          {activeSessions.length > 0 && (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full gradient-accent px-1.5 text-[10px] font-bold text-accent-foreground shadow-sm">
              {activeSessions.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger 
          value="snacks" 
          className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:rounded-md sm:px-4 sm:py-2 sm:text-sm"
        >
          <Cookie className="h-3.5 w-3.5" />
          Snacks
        </TabsTrigger>
        <TabsTrigger 
          value="pricing" 
          className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:rounded-md sm:px-4 sm:py-2 sm:text-sm"
        >
          <DollarSign className="h-3.5 w-3.5" />
          Pricing
        </TabsTrigger>
        <TabsTrigger 
          value="summary" 
          className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:rounded-md sm:px-4 sm:py-2 sm:text-sm"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Summary
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sessions" className="animate-in">
        <SessionsPanel
          activeSessions={activeSessions}
          checkedOutSessions={checkedOutSessions}
          snacks={snacks ?? []}
          pricing={pricing!}
          onUpdate={() => mutateSessions()}
        />
      </TabsContent>

      <TabsContent value="snacks" className="animate-in">
        <SnacksPanel snacks={snacks ?? []} onUpdate={() => mutateSnacks()} />
      </TabsContent>
      <TabsContent value="pricing" className="animate-in">
        <PricingPanel pricing={pricing!} onUpdate={() => mutatePricing()} />
      </TabsContent>

      <TabsContent value="summary" className="animate-in">
        <div className="flex flex-col gap-4 sm:gap-6">
          {/* The counter re-runs the summary aggregates after a history edit. */}
          <SummaryPanel refreshKey={summaryRefresh} />
          <HistoryPanel
            sessions={checkedOutSessions}
            snacks={snacks ?? []}
            pricing={pricing!}
            onUpdate={() => {
              mutateSessions()
              setSummaryRefresh((value) => value + 1)
            }}
          />
        </div>
      </TabsContent>
    </Tabs>
  )
}
