import { createMockClient, type MockRealtimeChannel } from "./query-builder"
import {
  isTableName,
  mockError,
  type Filter,
  type QueryRequest,
  type QueryResult,
  type Revisions,
  type Row,
  type TableName,
} from "./types"

/**
 * Browser-side mock client. Speaks to the JSON API under `/api/mock` and fakes
 * Supabase Realtime by polling table revisions.
 */

const API_BASE = "/api/mock"

const POLL_MS = (() => {
  const parsed = Number(process.env.NEXT_PUBLIC_MOCK_POLL_MS)
  return Number.isFinite(parsed) && parsed >= 250 ? parsed : 2000
})()

async function browserExecutor(request: QueryRequest): Promise<QueryResult> {
  const { table, action, select, filters, order, limit, single, values } = request
  const url = new URL(`${API_BASE}/${table}`, window.location.origin)

  const init: RequestInit = { cache: "no-store" }

  if (action === "select") {
    url.searchParams.set("q", JSON.stringify({ select, filters, order, limit, single }))
  } else {
    init.method = action === "insert" ? "POST" : action === "update" ? "PATCH" : "DELETE"
    init.headers = { "Content-Type": "application/json" }
    init.body = JSON.stringify({ values, filters, select, single })
  }

  try {
    const response = await fetch(url.toString(), init)
    const body: unknown = await response.json()
    if (body && typeof body === "object" && "data" in body) {
      return body as QueryResult
    }
    return {
      data: null,
      error: mockError("MOCK_BAD_RESPONSE", `Unexpected response from ${url.pathname}`),
    }
  } catch (error) {
    return {
      data: null,
      error: mockError(
        "MOCK_FETCH_FAILED",
        error instanceof Error ? error.message : "Mock API request failed",
      ),
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Realtime emulation                                                          */
/* -------------------------------------------------------------------------- */

interface ChangeListener {
  table: TableName
  event: string
  filter: Filter | null
  callback: (payload: Record<string, unknown>) => void
}

/** Parses a Realtime filter string such as `id=eq.<uuid>`. */
function parseRealtimeFilter(filter?: string): Filter | null {
  if (!filter) return null
  const match = /^([\w]+)=(eq)\.(.*)$/.exec(filter)
  if (!match) return null
  return { column: match[1], op: "eq", value: match[3] }
}

class MockPollingChannel implements MockRealtimeChannel {
  readonly listeners: ChangeListener[] = []

  constructor(public readonly topic: string) {}

  on(
    type: string,
    options: { event?: string; schema?: string; table?: string; filter?: string },
    callback: (payload: Record<string, unknown>) => void,
  ): MockRealtimeChannel {
    if (type === "postgres_changes" && options.table && isTableName(options.table)) {
      this.listeners.push({
        table: options.table,
        event: options.event ?? "*",
        filter: parseRealtimeFilter(options.filter),
        callback,
      })
    }
    return this
  }

  subscribe(callback?: (status: string) => void): MockRealtimeChannel {
    subscribeChannel(this)
    callback?.("SUBSCRIBED")
    return this
  }

  unsubscribe(): Promise<string> {
    unsubscribeChannel(this)
    return Promise.resolve("ok")
  }
}

const channels = new Set<MockPollingChannel>()
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastRevisions: Revisions | null = null
let pollInFlight = false

async function fetchRevisions(): Promise<Revisions | null> {
  try {
    const response = await fetch(`${API_BASE}/meta`, { cache: "no-store" })
    if (!response.ok) return null
    const body = (await response.json()) as { revisions?: Revisions }
    return body.revisions ?? null
  } catch {
    return null
  }
}

async function notify(listener: ChangeListener): Promise<void> {
  const payloadBase = {
    schema: "public",
    table: listener.table,
    eventType: listener.event === "*" ? "UPDATE" : listener.event,
  }

  // Revision polling cannot tell inserts from updates, so a filtered listener
  // gets the current row(s) and an unfiltered one just gets a nudge.
  if (!listener.filter) {
    listener.callback({ ...payloadBase, new: null, old: null })
    return
  }

  const result = await browserExecutor({
    table: listener.table,
    action: "select",
    select: "*",
    filters: [listener.filter],
  })

  const rows = Array.isArray(result.data) ? (result.data as Row[]) : []
  for (const row of rows) {
    listener.callback({ ...payloadBase, new: row, old: null })
  }
}

async function poll(): Promise<void> {
  if (pollInFlight) return
  pollInFlight = true
  try {
    const revisions = await fetchRevisions()
    if (!revisions) return

    const previous = lastRevisions
    lastRevisions = revisions
    if (!previous) return

    const changed = new Set<TableName>()
    for (const [table, revision] of Object.entries(revisions) as Array<[TableName, number]>) {
      if (previous[table] !== revision) changed.add(table)
    }
    if (changed.size === 0) return

    for (const channel of channels) {
      for (const listener of channel.listeners) {
        if (changed.has(listener.table)) void notify(listener)
      }
    }
  } finally {
    pollInFlight = false
  }
}

function subscribeChannel(channel: MockPollingChannel): void {
  channels.add(channel)
  if (pollTimer !== null) return
  // Establish a baseline first so subscribing never fires a spurious change.
  void fetchRevisions().then((revisions) => {
    lastRevisions = revisions ?? lastRevisions
  })
  pollTimer = setInterval(() => void poll(), POLL_MS)
}

function unsubscribeChannel(channel: MockPollingChannel): void {
  channels.delete(channel)
  if (channels.size === 0 && pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
    lastRevisions = null
  }
}

const realtime = {
  channel(topic: string) {
    return new MockPollingChannel(topic)
  },
  removeChannel(channel: MockRealtimeChannel) {
    void channel.unsubscribe()
  },
}

let cached: ReturnType<typeof createMockClient> | null = null

/** Memoized so every component shares one polling loop. */
export function createMockBrowserClient() {
  cached ??= createMockClient(browserExecutor, realtime)
  return cached
}
