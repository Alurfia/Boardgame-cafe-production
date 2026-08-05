export interface PricingConfig {
  id: string
  base_fee: number
  hourly_rate: number
  max_billable_hours: number
  created_at: string
  updated_at: string
}

export interface Snack {
  id: string
  name: string
  price: number
  available: boolean
  created_at: string
}

export interface Session {
  id: string
  customer_name: string
  member_count: number
  status: "active" | "checked_out"
  started_at: string
  ended_at: string | null
  time_in?: string | null
  time_out?: string | null
  used_hours?: number
  used_minutes?: number
  base_fee: number
  hourly_rate: number
  total_cost: number | null
  created_at: string
}

export interface SessionSnack {
  id: string
  session_id: string
  snack_id: string
  quantity: number
  price_at_time: number
  created_at: string
  snack?: Snack
}
