import { getDataMode } from "@/lib/data-mode"
import { runRpc } from "@/lib/mock/store"
import { isRpcName, mockError, type QueryResult } from "@/lib/mock/types"

/**
 * Mock database functions, mirroring PostgREST's `/rpc/<fn>`.
 *
 *   POST /api/mock/rpc/verify_login  { "p_username": "admin", "p_password": "…" }
 *
 * Same envelope rules as the table routes: `{ data, error }`, HTTP 200 for
 * data-level outcomes, 4xx only for malformed requests. A failed login is not an
 * error — it resolves to an empty array, exactly like the SQL function.
 */

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ fn: string }>
}

function envelope(result: QueryResult, status = 200): Response {
  return Response.json(result, { status })
}

function failure(code: string, message: string, status: number): Response {
  return envelope({ data: null, error: mockError(code, message) }, status)
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (getDataMode() !== "json") {
    return failure(
      "MOCK_DISABLED",
      "The mock API is only available when NEXT_PUBLIC_DATA_MODE=json",
      404,
    )
  }

  const { fn } = await context.params
  if (!isRpcName(fn)) return failure("42883", `function public.${fn} does not exist`, 404)

  let args: Record<string, unknown> = {}
  try {
    const text = await request.text()
    if (text.trim()) {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not an object")
      }
      args = parsed as Record<string, unknown>
    }
  } catch {
    return failure("MOCK_BAD_REQUEST", "Request body must be a JSON object", 400)
  }

  return envelope(await runRpc({ fn, args }))
}
