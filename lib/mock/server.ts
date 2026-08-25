import { createMockClient, type MockRealtimeChannel } from "./query-builder"
import { runQuery, runRpc } from "./store"

/**
 * Server-side mock client. Talks to the JSON store directly — server components
 * only fetch initial data, so realtime is a no-op here.
 */

class NoopChannel implements MockRealtimeChannel {
  constructor(public readonly topic: string) {}

  on(): MockRealtimeChannel {
    return this
  }

  subscribe(callback?: (status: string) => void): MockRealtimeChannel {
    callback?.("SUBSCRIBED")
    return this
  }

  unsubscribe(): Promise<string> {
    return Promise.resolve("ok")
  }
}

const realtime = {
  channel(topic: string) {
    return new NoopChannel(topic)
  },
  removeChannel() {},
}

export function createMockServerClient() {
  return createMockClient(runQuery, realtime, runRpc)
}
