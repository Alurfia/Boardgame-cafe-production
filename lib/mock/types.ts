export const TABLE_NAMES = [
  "pricing_config",
  "snacks",
  "sessions",
  "session_snacks",
] as const

export type TableName = (typeof TABLE_NAMES)[number]

export function isTableName(value: string): value is TableName {
  return (TABLE_NAMES as readonly string[]).includes(value)
}

export type Row = Record<string, unknown>

export type FilterOp = "eq" | "ilike"

export interface Filter {
  op: FilterOp
  column: string
  value: unknown
}

export interface OrderSpec {
  column: string
  ascending: boolean
}

export type SingleMode = "single" | "maybeSingle"

export type QueryAction = "select" | "insert" | "update" | "delete"

/** A serialized query — the wire format of the mock API. */
export interface QueryRequest {
  table: TableName
  action: QueryAction
  /** PostgREST-style column list, e.g. `"*, snacks(name)"`. `null` returns no rows. */
  select?: string | null
  filters?: Filter[]
  order?: OrderSpec[]
  limit?: number | null
  single?: SingleMode | null
  values?: Row | Row[]
}

/** Shaped like a `PostgrestError` so callers cannot tell the difference. */
export interface MockError {
  message: string
  code: string
  details: string | null
  hint: string | null
}

export interface QueryResult<T = unknown> {
  data: T | null
  error: MockError | null
}

export type Revisions = Record<TableName, number>

/**
 * Embedded resources the mock `select()` understands, mirroring the foreign
 * keys declared in `scripts/001_create_tables.sql`.
 */
export const RELATIONS: Partial<
  Record<TableName, Record<string, { table: TableName; column: string }>>
> = {
  session_snacks: {
    snacks: { table: "snacks", column: "snack_id" },
  },
}

/** Rows deleted from `table` cascade into these `[table, column]` pairs. */
export const CASCADES: Partial<Record<TableName, Array<[TableName, string]>>> = {
  sessions: [["session_snacks", "session_id"]],
  snacks: [["session_snacks", "snack_id"]],
}

export function mockError(
  code: string,
  message: string,
  details: string | null = null,
  hint: string | null = null,
): MockError {
  return { code, message, details, hint }
}
