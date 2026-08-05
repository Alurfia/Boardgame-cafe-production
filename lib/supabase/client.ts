import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getDataMode } from '@/lib/data-mode'
import { createMockBrowserClient } from '@/lib/mock/client'

/**
 * Returns whichever data source `NEXT_PUBLIC_DATA_MODE` selects. In `json` mode
 * this is a stand-in backed by the mock API at `/api/mock`; callers use the
 * same query and channel API either way.
 */
export function createClient(): SupabaseClient {
  if (getDataMode() === 'json') {
    return createMockBrowserClient() as unknown as SupabaseClient
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) as unknown as SupabaseClient
}
