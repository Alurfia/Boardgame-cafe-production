import { createClient } from "@/lib/supabase/server"
import { AdminDashboard } from "@/components/admin/admin-dashboard"
import type { PricingConfig, Snack, Session } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const supabase = await createClient()

  const [sessionsRes, snacksRes, pricingRes] = await Promise.all([
    supabase.from("sessions").select("*").order("created_at", { ascending: false }),
    supabase.from("snacks").select("*").order("name"),
    supabase.from("pricing_config").select("*").limit(1).single(),
  ])

  return (
    <AdminDashboard
      initialSessions={(sessionsRes.data ?? []) as Session[]}
      initialSnacks={(snacksRes.data ?? []) as Snack[]}
      initialPricing={pricingRes.data as PricingConfig}
    />
  )
}
