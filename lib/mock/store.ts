import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { verifyPassword } from "./password"
import { createSeed } from "./seed"
import {
  CASCADES,
  RELATIONS,
  TABLE_NAMES,
  isPrivateTable,
  mockError,
  type Filter,
  type MockError,
  type OrderSpec,
  type QueryRequest,
  type QueryResult,
  type Revisions,
  type Row,
  type RpcRequest,
  type SingleMode,
  type TableName,
} from "./types"

/**
 * Server-side JSON "database" behind `/api/mock`.
 *
 * Node-only — never import this from a client component. The browser talks to
 * the API routes instead (see `lib/mock/client.ts`).
 */

export const DB_FILE = process.env.MOCK_DB_FILE
  ? path.resolve(process.env.MOCK_DB_FILE)
  : path.join(process.cwd(), "data", "mock-db.json")

interface MockDbState {
  tables: Record<TableName, Row[]>
  revisions: Revisions
}

// Survive dev hot-reloads, which re-evaluate this module.
const globalRef = globalThis as typeof globalThis & { __mockDb?: Promise<MockDbState> }

function emptyRevisions(): Revisions {
  return TABLE_NAMES.reduce((acc, table) => {
    acc[table] = 0
    return acc
  }, {} as Revisions)
}

function stateFromTables(tables: Record<TableName, Row[]>): MockDbState {
  return { tables, revisions: emptyRevisions() }
}

function isValidState(value: unknown): value is MockDbState {
  if (!value || typeof value !== "object") return false
  const candidate = value as MockDbState
  if (!candidate.tables || typeof candidate.tables !== "object") return false
  return TABLE_NAMES.every((table) => Array.isArray(candidate.tables[table]))
}

async function loadState(): Promise<MockDbState> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8")
    const parsed: unknown = JSON.parse(raw)
    if (isValidState(parsed)) {
      return { tables: parsed.tables, revisions: { ...emptyRevisions(), ...parsed.revisions } }
    }
  } catch {
    // Missing or corrupt file: fall through and seed a fresh database.
  }

  const state = stateFromTables(createSeed())
  persist(state)
  return state
}

function getState(): Promise<MockDbState> {
  globalRef.__mockDb ??= loadState()
  return globalRef.__mockDb
}

let writeChain: Promise<void> = Promise.resolve()

/**
 * Best-effort persistence. Writes are serialized; a read-only filesystem (some
 * serverless hosts) degrades to an in-memory database rather than failing.
 */
function persist(state: MockDbState): void {
  const snapshot = JSON.stringify(state, null, 2)
  writeChain = writeChain
    .then(async () => {
      await fs.mkdir(path.dirname(DB_FILE), { recursive: true })
      await fs.writeFile(DB_FILE, snapshot, "utf8")
    })
    .catch(() => {})
}

/* -------------------------------------------------------------------------- */
/* Column semantics                                                            */
/* -------------------------------------------------------------------------- */

/** NUMERIC/INTEGER columns, coerced so JSON strings behave like Postgres numbers. */
const NUMERIC_COLUMNS: Record<TableName, string[]> = {
  pricing_config: ["base_fee", "hourly_rate", "max_billable_hours"],
  snacks: ["price"],
  sessions: [
    "member_count",
    "base_fee",
    "hourly_rate",
    "total_cost",
    "used_hours",
    "used_minutes",
    "discount_hours",
    "paused_ms",
  ],
  session_snacks: ["quantity", "price_at_time"],
  app_users: [],
}

const TABLE_DEFAULTS: Record<TableName, Row> = {
  pricing_config: { base_fee: 5, hourly_rate: 3, max_billable_hours: 5 },
  snacks: { available: true },
  sessions: {
    member_count: 1,
    status: "active",
    ended_at: null,
    time_out: null,
    used_hours: 0,
    used_minutes: 0,
    discount_hours: 0,
    paused_at: null,
    paused_ms: 0,
    auto_checked_out: false,
    parent_session_id: null,
    base_fee: 5,
    hourly_rate: 3,
    total_cost: null,
  },
  session_snacks: { quantity: 1 },
  app_users: { role: "staff", is_active: true },
}

const REQUIRED_COLUMNS: Record<TableName, string[]> = {
  pricing_config: ["base_fee", "hourly_rate"],
  snacks: ["name", "price"],
  sessions: ["customer_name"],
  session_snacks: ["session_id", "snack_id", "price_at_time"],
  app_users: ["username", "password_hash"],
}

/**
 * Foreign keys: `column` in this table must reference an existing row.
 *
 * `sessions.parent_session_id` (`010_*.sql`) is deliberately absent. This map
 * only models "the referenced row must exist" and `CASCADES` only models
 * delete-cascade, so neither can express that column's `ON DELETE SET NULL` —
 * enforcing half of it would drift further from Postgres than leaving it out.
 */
const FOREIGN_KEYS: Partial<Record<TableName, Array<{ column: string; table: TableName }>>> = {
  session_snacks: [
    { column: "session_id", table: "sessions" },
    { column: "snack_id", table: "snacks" },
  ],
}

function coerceNumerics(table: TableName, row: Row): Row {
  const next = { ...row }
  for (const column of NUMERIC_COLUMNS[table]) {
    const value = next[column]
    if (value === null || value === undefined || typeof value === "number") continue
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) next[column] = parsed
  }
  return next
}

function applyDefaults(table: TableName, values: Row): Row {
  const now = new Date().toISOString()
  const row: Row = { ...TABLE_DEFAULTS[table], ...values }

  row.id = values.id ?? randomUUID()
  row.created_at = values.created_at ?? now

  // Both default to now() in Postgres (001 and 008), so the check-in paths can
  // omit them and let the server own the clock.
  if (table === "sessions" && row.started_at == null) row.started_at = now
  if (table === "sessions" && row.time_in == null) row.time_in = now
  if (table === "pricing_config" && row.updated_at == null) row.updated_at = now
  if (table === "app_users" && row.updated_at == null) row.updated_at = now

  return coerceNumerics(table, row)
}

/* -------------------------------------------------------------------------- */
/* Constraints (mirroring scripts/*.sql)                                       */
/* -------------------------------------------------------------------------- */

function normalizeName(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase()
}

function validateRow(
  table: TableName,
  row: Row,
  tables: Record<TableName, Row[]>,
): MockError | null {
  for (const column of REQUIRED_COLUMNS[table]) {
    const value = row[column]
    if (value === null || value === undefined || value === "") {
      return mockError(
        "23502",
        `null value in column "${column}" of relation "${table}" violates not-null constraint`,
      )
    }
  }

  for (const fk of FOREIGN_KEYS[table] ?? []) {
    const value = row[fk.column]
    if (value === null || value === undefined) continue
    if (!tables[fk.table].some((candidate) => candidate.id === value)) {
      return mockError(
        "23503",
        `insert or update on table "${table}" violates foreign key constraint on "${fk.column}"`,
        `Key (${fk.column})=(${String(value)}) is not present in table "${fk.table}".`,
      )
    }
  }

  if (table === "sessions") {
    const minutes = Number(row.used_minutes ?? 0)
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
      return mockError(
        "23514",
        'new row for relation "sessions" violates check constraint "sessions_used_minutes_range_check"',
      )
    }

    const discountHours = Number(row.discount_hours ?? 0)
    if (!Number.isFinite(discountHours) || discountHours < 0) {
      return mockError(
        "23514",
        'new row for relation "sessions" violates check constraint "sessions_discount_hours_non_negative_check"',
      )
    }

    const pausedMs = Number(row.paused_ms ?? 0)
    if (!Number.isFinite(pausedMs) || pausedMs < 0) {
      return mockError(
        "23514",
        'new row for relation "sessions" violates check constraint "sessions_paused_ms_non_negative_check"',
      )
    }

    const status = row.status
    if (status !== "active" && status !== "checked_out") {
      return mockError("23514", 'new row for relation "sessions" violates check constraint on "status"')
    }
  }

  if (table === "app_users") {
    const role = row.role
    if (role !== "admin" && role !== "staff") {
      return mockError(
        "23514",
        'new row for relation "app_users" violates check constraint "app_users_role_check"',
      )
    }
  }

  return null
}

/**
 * `007_create_app_users.sql`: one account per case-insensitive, trimmed
 * username.
 */
function checkUsernameUniqueness(rows: Row[]): MockError | null {
  const seen = new Set<string>()
  for (const row of rows) {
    const key = normalizeName(row.username)
    if (seen.has(key)) {
      return mockError(
        "23505",
        'duplicate key value violates unique constraint "app_users_unique_username_idx"',
        `Key (lower(btrim(username)))=(${key}) already exists.`,
      )
    }
    seen.add(key)
  }
  return null
}

/**
 * `006_unique_active_session_name.sql`: one active session per case-insensitive,
 * trimmed customer name. History may repeat a name freely.
 */
function checkActiveNameUniqueness(rows: Row[]): MockError | null {
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.status !== "active") continue
    const key = normalizeName(row.customer_name)
    if (seen.has(key)) {
      return mockError(
        "23505",
        'duplicate key value violates unique constraint "sessions_unique_active_customer_name_idx"',
        `Key (lower(btrim(customer_name)))=(${key}) already exists.`,
      )
    }
    seen.add(key)
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Filtering, ordering, projection                                             */
/* -------------------------------------------------------------------------- */

function valueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return false
  return String(a) === String(b)
}

function ilikeMatches(value: unknown, pattern: unknown): boolean {
  if (value === null || value === undefined) return false
  const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`, "i")
  return regex.test(String(value))
}

function matchesFilters(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const value = row[filter.column]
    return filter.op === "ilike"
      ? ilikeMatches(value, filter.value)
      : valueEquals(value, filter.value)
  })
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  // Postgres sorts NULLs last for ASC; the caller flips this for DESC.
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b))
}

function sortRows(rows: Row[], order: OrderSpec[]): Row[] {
  if (order.length === 0) return rows
  return [...rows].sort((left, right) => {
    for (const spec of order) {
      const result = compareValues(left[spec.column], right[spec.column])
      if (result !== 0) return spec.ascending ? result : -result
    }
    return 0
  })
}

interface SelectSpec {
  all: boolean
  columns: string[]
  relations: Array<{ alias: string; select: SelectSpec }>
}

/** Splits on commas that are not inside parentheses. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of input) {
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === "," && depth === 0) {
      parts.push(current)
      current = ""
      continue
    }
    current += char
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

function parseSelect(select: string): SelectSpec {
  const spec: SelectSpec = { all: false, columns: [], relations: [] }
  for (const token of splitTopLevel(select)) {
    const relation = /^([a-zA-Z_]\w*)\s*\(([\s\S]*)\)$/.exec(token)
    if (relation) {
      spec.relations.push({ alias: relation[1], select: parseSelect(relation[2] || "*") })
      continue
    }
    if (token === "*") {
      spec.all = true
      continue
    }
    spec.columns.push(token)
  }
  return spec
}

function projectRow(
  table: TableName,
  row: Row,
  spec: SelectSpec,
  tables: Record<TableName, Row[]>,
): Row {
  const projected: Row = spec.all ? { ...row } : {}
  for (const column of spec.columns) {
    projected[column] = row[column] ?? null
  }

  for (const relation of spec.relations) {
    const definition = RELATIONS[table]?.[relation.alias]
    if (!definition) {
      projected[relation.alias] = null
      continue
    }
    const related = tables[definition.table].find((candidate) =>
      valueEquals(candidate.id, row[definition.column]),
    )
    projected[relation.alias] = related
      ? projectRow(definition.table, related, relation.select, tables)
      : null
  }

  return projected
}

function project(
  table: TableName,
  rows: Row[],
  select: string,
  tables: Record<TableName, Row[]>,
): Row[] {
  const spec = parseSelect(select)
  return rows.map((row) => projectRow(table, row, spec, tables))
}

function finalize(rows: Row[], single: SingleMode | null | undefined): QueryResult {
  if (single === "single") {
    if (rows.length !== 1) {
      return {
        data: null,
        error: mockError(
          "PGRST116",
          "JSON object requested, multiple (or no) rows returned",
          `Results contain ${rows.length} rows`,
        ),
      }
    }
    return { data: rows[0], error: null }
  }

  if (single === "maybeSingle") {
    if (rows.length === 0) return { data: null, error: null }
    if (rows.length > 1) {
      return {
        data: null,
        error: mockError(
          "PGRST116",
          "JSON object requested, multiple (or no) rows returned",
          `Results contain ${rows.length} rows`,
        ),
      }
    }
    return { data: rows[0], error: null }
  }

  return { data: rows, error: null }
}

/* -------------------------------------------------------------------------- */
/* Query execution                                                             */
/* -------------------------------------------------------------------------- */

function bump(state: MockDbState, table: TableName): void {
  state.revisions[table] = (state.revisions[table] ?? 0) + 1
}

function selectRows(state: MockDbState, request: QueryRequest): Row[] {
  const filters = request.filters ?? []
  let rows = state.tables[request.table].filter((row) => matchesFilters(row, filters))
  rows = sortRows(rows, request.order ?? [])
  if (typeof request.limit === "number" && request.limit >= 0) {
    rows = rows.slice(0, request.limit)
  }
  return rows
}

function resultFor(
  state: MockDbState,
  request: QueryRequest,
  rows: Row[],
): QueryResult {
  if (!request.select) return { data: null, error: null }
  return finalize(project(request.table, rows, request.select, state.tables), request.single)
}

export async function runQuery(request: QueryRequest): Promise<QueryResult> {
  const state = await getState()
  const { table } = request

  // `app_users` has RLS with no policy in `db` mode, so the anon key gets
  // nothing back. Refuse here too, or `json` mode would happily serve password
  // hashes over `/api/mock/app_users`.
  if (isPrivateTable(table)) {
    return {
      data: null,
      error: mockError(
        "42501",
        `permission denied for table ${table}`,
        "Row-level security is enabled and no policy grants access. Use an RPC instead.",
      ),
    }
  }

  try {
    switch (request.action) {
      case "select": {
        const rows = selectRows(state, request)
        return finalize(
          project(table, rows, request.select ?? "*", state.tables),
          request.single,
        )
      }

      case "insert": {
        const incoming = Array.isArray(request.values)
          ? request.values
          : request.values
            ? [request.values]
            : []
        const prepared = incoming.map((values) => applyDefaults(table, values))

        for (const row of prepared) {
          const error = validateRow(table, row, state.tables)
          if (error) return { data: null, error }
        }

        if (table === "sessions") {
          const error = checkActiveNameUniqueness([...state.tables.sessions, ...prepared])
          if (error) return { data: null, error }
        }

        if (table === "app_users") {
          const error = checkUsernameUniqueness([...state.tables.app_users, ...prepared])
          if (error) return { data: null, error }
        }

        state.tables[table].push(...prepared)
        bump(state, table)
        persist(state)
        return resultFor(state, request, prepared)
      }

      case "update": {
        const values = coerceNumerics(table, (request.values as Row) ?? {})
        const filters = request.filters ?? []
        const targets = state.tables[table].filter((row) => matchesFilters(row, filters))
        if (targets.length === 0) return resultFor(state, request, [])

        const updated = targets.map((row) => ({ ...row, ...values, id: row.id }))
        for (const row of updated) {
          const error = validateRow(table, row, state.tables)
          if (error) return { data: null, error }
        }

        if (table === "sessions") {
          const untouched = state.tables.sessions.filter(
            (row) => !targets.some((target) => target.id === row.id),
          )
          const error = checkActiveNameUniqueness([...untouched, ...updated])
          if (error) return { data: null, error }
        }

        if (table === "app_users") {
          const untouched = state.tables.app_users.filter(
            (row) => !targets.some((target) => target.id === row.id),
          )
          const error = checkUsernameUniqueness([...untouched, ...updated])
          if (error) return { data: null, error }
        }

        state.tables[table] = state.tables[table].map((row) => {
          const replacement = updated.find((candidate) => candidate.id === row.id)
          return replacement ?? row
        })
        bump(state, table)
        persist(state)
        return resultFor(state, request, updated)
      }

      case "delete": {
        const filters = request.filters ?? []
        const removed = state.tables[table].filter((row) => matchesFilters(row, filters))
        if (removed.length === 0) return resultFor(state, request, [])

        const removedIds = new Set(removed.map((row) => row.id))
        state.tables[table] = state.tables[table].filter((row) => !removedIds.has(row.id))
        bump(state, table)

        for (const [childTable, column] of CASCADES[table] ?? []) {
          const before = state.tables[childTable].length
          state.tables[childTable] = state.tables[childTable].filter(
            (row) => !removedIds.has(row[column] as string),
          )
          if (state.tables[childTable].length !== before) bump(state, childTable)
        }

        persist(state)
        return resultFor(state, request, removed)
      }

      default:
        return {
          data: null,
          error: mockError("MOCK_BAD_REQUEST", `Unsupported action: ${String(request.action)}`),
        }
    }
  } catch (error) {
    return {
      data: null,
      error: mockError(
        "MOCK_INTERNAL",
        error instanceof Error ? error.message : "Unknown mock database error",
      ),
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Database functions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `verify_login(p_username, p_password)` from `scripts/007_create_app_users.sql`.
 * Returns a one-row array on success and an empty array otherwise — PostgREST
 * shapes a `RETURNS TABLE` function that way, and never leaks whether it was the
 * username or the password that was wrong.
 */
async function verifyLogin(args: Record<string, unknown>): Promise<QueryResult> {
  const state = await getState()
  const username = normalizeName(args.p_username)
  const password = String(args.p_password ?? "")

  if (!username || !password) return { data: [], error: null }

  const user = state.tables.app_users.find(
    (row) => row.is_active !== false && normalizeName(row.username) === username,
  )

  if (!user || !verifyPassword(password, String(user.password_hash ?? ""))) {
    return { data: [], error: null }
  }

  return {
    data: [{ id: user.id, username: user.username, role: user.role }],
    error: null,
  }
}

export async function runRpc(request: RpcRequest): Promise<QueryResult> {
  try {
    switch (request.fn) {
      case "verify_login":
        return await verifyLogin(request.args ?? {})
      default:
        return {
          data: null,
          error: mockError(
            "42883",
            `function public.${String(request.fn)} does not exist`,
          ),
        }
    }
  } catch (error) {
    return {
      data: null,
      error: mockError(
        "MOCK_INTERNAL",
        error instanceof Error ? error.message : "Unknown mock database error",
      ),
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Introspection helpers used by /api/mock/meta                                */
/* -------------------------------------------------------------------------- */

export async function getRevisions(): Promise<Revisions> {
  const state = await getState()
  return { ...state.revisions }
}

export async function getCounts(): Promise<Record<TableName, number>> {
  const state = await getState()
  return TABLE_NAMES.reduce(
    (acc, table) => {
      acc[table] = state.tables[table].length
      return acc
    },
    {} as Record<TableName, number>,
  )
}

/** Throws away every row and re-seeds. */
export async function resetDatabase(): Promise<void> {
  const state = await getState()
  state.tables = createSeed()
  for (const table of TABLE_NAMES) bump(state, table)
  persist(state)
}
