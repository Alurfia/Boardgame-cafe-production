export type UserRole = "admin" | "staff"

/**
 * A staff account. `password_hash` is never selectable through the anon key —
 * see `scripts/007_create_app_users.sql` — so it is not modelled here.
 */
export interface AppUser {
  id: string
  username: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

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
  /** Closed by the nightly sweep rather than by a person — `009_*.sql`. */
  auto_checked_out?: boolean
  /** Redeemed discount privileges, one billable hour each — `011_*.sql`. */
  discount_hours?: number
  /**
   * When the clock was stopped, or null while it is running — `012_*.sql`.
   * Cleared at checkout, so a `checked_out` row is never left mid-pause.
   */
  paused_at?: string | null
  /** Paused spans that have already ended, in milliseconds — `012_*.sql`. */
  paused_ms?: number
  /** Set on the child row a partial checkout split off — `010_*.sql`. */
  parent_session_id?: string | null
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
