import { getDataMode } from "@/lib/data-mode"
import { DB_FILE, getCounts, getRevisions, resetDatabase } from "@/lib/mock/store"
import { mockError } from "@/lib/mock/types"

/**
 * Mock API control endpoint.
 *
 *   GET  /api/mock/meta   -> { mode, file, revisions, counts }
 *   POST /api/mock/meta   { "action": "reset" } -> re-seeds the JSON database
 *
 * `revisions` is a per-table counter bumped on every write. The browser client
 * polls it to emulate Supabase Realtime.
 */

export const dynamic = "force-dynamic"

function disabled(): Response {
  return Response.json(
    {
      data: null,
      error: mockError(
        "MOCK_DISABLED",
        "The mock API is only available when NEXT_PUBLIC_DATA_MODE=json",
      ),
    },
    { status: 404 },
  )
}

export async function GET(): Promise<Response> {
  if (getDataMode() !== "json") return disabled()

  const [revisions, counts] = await Promise.all([getRevisions(), getCounts()])
  return Response.json({ mode: "json", file: DB_FILE, revisions, counts })
}

export async function POST(request: Request): Promise<Response> {
  if (getDataMode() !== "json") return disabled()

  let action = "reset"
  try {
    const text = await request.text()
    if (text.trim()) {
      const body: unknown = JSON.parse(text)
      if (body && typeof body === "object" && typeof (body as { action?: unknown }).action === "string") {
        action = (body as { action: string }).action
      }
    }
  } catch {
    return Response.json(
      { data: null, error: mockError("MOCK_BAD_REQUEST", "Request body must be a JSON object") },
      { status: 400 },
    )
  }

  if (action !== "reset") {
    return Response.json(
      { data: null, error: mockError("MOCK_BAD_REQUEST", `Unknown action: ${action}`) },
      { status: 400 },
    )
  }

  await resetDatabase()
  const [revisions, counts] = await Promise.all([getRevisions(), getCounts()])
  return Response.json({ mode: "json", file: DB_FILE, revisions, counts, reset: true })
}
