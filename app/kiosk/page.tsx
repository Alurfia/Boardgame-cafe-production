import { createClient } from "@/lib/supabase/server"
import { KioskClient } from "@/components/kiosk/kiosk-client"
import type { PricingConfig, Snack } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function KioskPage() {
  const supabase = await createClient()

  const [snacksRes, pricingRes] = await Promise.all([
    supabase.from("snacks").select("*").eq("available", true).order("name"),
    supabase.from("pricing_config").select("*").limit(1).single(),
  ])

  return (
    <KioskClient
      initialSnacks={(snacksRes.data ?? []) as Snack[]}
      initialPricing={(pricingRes.data ?? null) as PricingConfig | null}
    />
  )
}
