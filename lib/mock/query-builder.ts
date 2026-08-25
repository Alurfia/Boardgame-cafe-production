import {
  mockError,
  type Filter,
  type QueryAction,
  type QueryRequest,
  type QueryResult,
  type Row,
  type RpcName,
  type RpcRequest,
  type SingleMode,
  type TableName,
} from "./types"

/** Runs a serialized query — over HTTP in the browser, in-process on the server. */
export type Executor = (request: QueryRequest) => Promise<QueryResult>

/** Runs a database function. Same split: HTTP in the browser, in-process on the server. */
export type RpcExecutor = (request: RpcRequest) => Promise<QueryResult>

/**
 * A thenable that collects the same chained calls as `@supabase/supabase-js`
 * and resolves to `{ data, error }`. Only the subset this app uses is
 * implemented: eq, ilike, order, limit, single, maybeSingle.
 */
class MockQueryBuilder implements PromiseLike<QueryResult> {
  private readonly request: QueryRequest

  constructor(
    private readonly execute: Executor,
    table: TableName,
    action: QueryAction,
    init: Partial<QueryRequest> = {},
  ) {
    this.request = {
      table,
      action,
      select: init.select ?? null,
      filters: [],
      order: [],
      limit: null,
      single: null,
      values: init.values,
    }
  }

  select(columns = "*"): this {
    this.request.select = columns
    return this
  }

  eq(column: string, value: unknown): this {
    return this.filter({ op: "eq", column, value })
  }

  ilike(column: string, pattern: string): this {
    return this.filter({ op: "ilike", column, value: pattern })
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.request.order?.push({ column, ascending: options?.ascending ?? true })
    return this
  }

  limit(count: number): this {
    this.request.limit = count
    return this
  }

  single(): this {
    this.request.single = "single"
    return this
  }

  maybeSingle(): this {
    this.request.single = "maybeSingle"
    return this
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute(this.request).then(onfulfilled, onrejected)
  }

  private filter(filter: Filter): this {
    this.request.filters?.push(filter)
    return this
  }
}

/**
 * `supabase.rpc(fn, args)`. A `RETURNS TABLE` function resolves to an array, so
 * `single()`/`maybeSingle()` narrow it the same way they do for a select.
 */
class MockRpcBuilder implements PromiseLike<QueryResult> {
  private mode: SingleMode | null = null

  constructor(
    private readonly execute: RpcExecutor,
    private readonly request: RpcRequest,
  ) {}

  single(): this {
    this.mode = "single"
    return this
  }

  maybeSingle(): this {
    this.mode = "maybeSingle"
    return this
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute(this.request)
      .then((result) => this.narrow(result))
      .then(onfulfilled, onrejected)
  }

  private narrow(result: QueryResult): QueryResult {
    if (!this.mode || result.error) return result

    const rows = Array.isArray(result.data) ? (result.data as Row[]) : []
    if (rows.length === 1) return { data: rows[0], error: null }
    if (rows.length === 0 && this.mode === "maybeSingle") return { data: null, error: null }

    return {
      data: null,
      error: mockError(
        "PGRST116",
        "JSON object requested, multiple (or no) rows returned",
        `Results contain ${rows.length} rows`,
      ),
    }
  }
}

class MockTable {
  constructor(
    private readonly execute: Executor,
    private readonly table: TableName,
  ) {}

  select(columns = "*") {
    return new MockQueryBuilder(this.execute, this.table, "select", { select: columns })
  }

  insert(values: Row | Row[]) {
    return new MockQueryBuilder(this.execute, this.table, "insert", { values })
  }

  update(values: Row) {
    return new MockQueryBuilder(this.execute, this.table, "update", { values })
  }

  delete() {
    return new MockQueryBuilder(this.execute, this.table, "delete")
  }
}

export interface RealtimeAdapter {
  channel(topic: string): MockRealtimeChannel
  removeChannel(channel: MockRealtimeChannel): void
}

export interface MockRealtimeChannel {
  topic: string
  on(
    type: string,
    options: { event?: string; schema?: string; table?: string; filter?: string },
    callback: (payload: Record<string, unknown>) => void,
  ): MockRealtimeChannel
  subscribe(callback?: (status: string) => void): MockRealtimeChannel
  unsubscribe(): Promise<string>
}

/** Assembles the `supabase`-shaped façade the components already call. */
export function createMockClient(
  execute: Executor,
  realtime: RealtimeAdapter,
  executeRpc: RpcExecutor,
) {
  return {
    from(table: string) {
      return new MockTable(execute, table as TableName)
    },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      return new MockRpcBuilder(executeRpc, { fn: fn as RpcName, args })
    },
    channel(topic: string) {
      return realtime.channel(topic)
    },
    removeChannel(channel: MockRealtimeChannel) {
      realtime.removeChannel(channel)
      return Promise.resolve("ok")
    },
  }
}

export type MockClient = ReturnType<typeof createMockClient>
