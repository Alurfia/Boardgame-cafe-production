export type DataMode = "json" | "db"

/**
 * Where the app reads and writes its data.
 *
 * - `json` — the mock JSON API under `/api/mock`, backed by a local JSON file.
 *   No Supabase project required.
 * - `db`   — a real Supabase project.
 *
 * An explicit `NEXT_PUBLIC_DATA_MODE` always wins. Without it we fall back to
 * `db` when a Supabase URL is configured and `json` when it is not, so the app
 * still boots with an empty `.env.local`.
 */
export function getDataMode(): DataMode {
  const raw = (process.env.NEXT_PUBLIC_DATA_MODE ?? "").trim().toLowerCase()
  if (raw === "json" || raw === "mock") return "json"
  if (raw === "db" || raw === "supabase") return "db"
  return process.env.NEXT_PUBLIC_SUPABASE_URL ? "db" : "json"
}

export function isJsonMode(): boolean {
  return getDataMode() === "json"
}
