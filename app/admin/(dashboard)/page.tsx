import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getAdminSession } from "@/lib/auth/server"
import { AdminDashboard } from "@/components/admin/admin-dashboard"
import type { PricingConfig, Snack, Session } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const session = await getAdminSession()
  if (!session) redirect("/admin/login")

  const supabase = await createClient()

  // Pricing is fetched for both roles: the sessions tab needs the rates to show
  // live estimates, even though only an admin gets the tab that edits them.
  const [sessionsRes, snacksRes, pricingRes] = await Promise.all([
    supabase.from("sessions").select("*").order("created_at", { ascending: false }),
    supabase.from("snacks").select("*").order("name"),
    supabase.from("pricing_config").select("*").limit(1).single(),
  ])

  return (
    <AdminDashboard
      role={session.role}
      initialSessions={(sessionsRes.data ?? []) as Session[]}
      initialSnacks={(snacksRes.data ?? []) as Snack[]}
      initialPricing={pricingRes.data as PricingConfig}
    />
  )
}
