import { getDataMode } from "@/lib/data-mode"
import { runQuery } from "@/lib/mock/store"
import {
  isTableName,
  mockError,
  type Filter,
  type OrderSpec,
  type QueryResult,
  type Row,
  type SingleMode,
  type TableName,
} from "@/lib/mock/types"

/**
 * Mock JSON API — one resource per table.
 *
 *   GET    /api/mock/sessions                     all rows
 *   GET    /api/mock/sessions?select=id,name      column projection
 *   GET    /api/mock/sessions?limit=5
 *   GET    /api/mock/sessions?q={"filters":[{"op":"eq","column":"status","value":"active"}]}
 *   POST   /api/mock/sessions        { values, select?, single? }
 *   PATCH  /api/mock/sessions        { values, filters, select?, single? }
 *   DELETE /api/mock/sessions        { filters, select?, single? }
 *
 * Every response is a Supabase-shaped `{ data, error }` envelope. Data-level
 * failures (constraint violations, `.single()` misses) come back with HTTP 200
 * and a populated `error`; only malformed requests use a 4xx status.
 */

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ table: string }>
}

function envelope(result: QueryResult, status = 200): Response {
  return Response.json(result, { status })
}

function failure(code: string, message: string, status: number): Response {
  return envelope({ data: null, error: mockError(code, message) }, status)
}

async function resolveTable(context: RouteContext): Promise<TableName | null> {
  const { table } = await context.params
  return isTableName(table) ? table : null
}

function guard(): Response | null {
  if (getDataMode() !== "json") {
    return failure(
      "MOCK_DISABLED",
      "The mock API is only available when NEXT_PUBLIC_DATA_MODE=json",
      404,
    )
  }
  return null
}

function sanitizeFilters(value: unknown): Filter[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const candidate = entry as Partial<Filter>
    if (typeof candidate.column !== "string") return []
    const op = candidate.op === "ilike" ? "ilike" : "eq"
    return [{ op, column: candidate.column, value: candidate.value ?? null }]
  })
}

function sanitizeOrder(value: unknown): OrderSpec[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const candidate = entry as Partial<OrderSpec>
    if (typeof candidate.column !== "string") return []
    return [{ column: candidate.column, ascending: candidate.ascending !== false }]
  })
}

function sanitizeSelect(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function sanitizeSingle(value: unknown): SingleMode | null {
  return value === "single" || value === "maybeSingle" ? value : null
}

function sanitizeLimit(value: unknown): number | null {
  // Guard the empty cases first: Number(null) and Number("") are both 0, which
  // would silently turn "no limit" into "no rows".
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null
}

function sanitizeValues(value: unknown): Row | Row[] | undefined {
  if (Array.isArray(value)) return value as Row[]
  if (value && typeof value === "object") return value as Row
  return undefined
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text()
    if (!text.trim()) return {}
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const blocked = guard()
  if (blocked) return blocked

  const table = await resolveTable(context)
  if (!table) return failure("42P01", "Unknown table", 404)

  const params = new URL(request.url).searchParams
  let spec: Record<string, unknown> = {}
  const raw = params.get("q")
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object") throw new Error("not an object")
      spec = parsed as Record<string, unknown>
    } catch {
      return failure("MOCK_BAD_REQUEST", "The `q` parameter must be a JSON object", 400)
    }
  }

  const result = await runQuery({
    table,
    action: "select",
    select: sanitizeSelect(spec.select ?? params.get("select")) ?? "*",
    filters: sanitizeFilters(spec.filters),
    order: sanitizeOrder(spec.order),
    limit: sanitizeLimit(spec.limit ?? params.get("limit")),
    single: sanitizeSingle(spec.single ?? params.get("single")),
  })

  return envelope(result)
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const blocked = guard()
  if (blocked) return blocked

  const table = await resolveTable(context)
  if (!table) return failure("42P01", "Unknown table", 404)

  const body = await readBody(request)
  if (!body) return failure("MOCK_BAD_REQUEST", "Request body must be a JSON object", 400)

  const values = sanitizeValues(body.values)
  if (!values) return failure("MOCK_BAD_REQUEST", "`values` is required", 400)

  const result = await runQuery({
    table,
    action: "insert",
    values,
    select: sanitizeSelect(body.select),
    single: sanitizeSingle(body.single),
  })

  return envelope(result)
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const blocked = guard()
  if (blocked) return blocked

  const table = await resolveTable(context)
  if (!table) return failure("42P01", "Unknown table", 404)

  const body = await readBody(request)
  if (!body) return failure("MOCK_BAD_REQUEST", "Request body must be a JSON object", 400)

  const values = sanitizeValues(body.values)
  if (!values || Array.isArray(values)) {
    return failure("MOCK_BAD_REQUEST", "`values` must be an object", 400)
  }

  const result = await runQuery({
    table,
    action: "update",
    values,
    filters: sanitizeFilters(body.filters),
    select: sanitizeSelect(body.select),
    single: sanitizeSingle(body.single),
  })

  return envelope(result)
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const blocked = guard()
  if (blocked) return blocked

  const table = await resolveTable(context)
  if (!table) return failure("42P01", "Unknown table", 404)

  const body = await readBody(request)
  if (!body) return failure("MOCK_BAD_REQUEST", "Request body must be a JSON object", 400)

  const filters = sanitizeFilters(body.filters)
  if (filters.length === 0) {
    return failure("MOCK_BAD_REQUEST", "DELETE requires at least one filter", 400)
  }

  const result = await runQuery({
    table,
    action: "delete",
    filters,
    select: sanitizeSelect(body.select),
    single: sanitizeSingle(body.single),
  })

  return envelope(result)
}
