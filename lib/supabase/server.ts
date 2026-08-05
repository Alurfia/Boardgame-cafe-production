import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

import { getDataMode } from '@/lib/data-mode'
import { createMockServerClient } from '@/lib/mock/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 *
 * In `json` mode this returns a stand-in that reads the local JSON database
 * directly, so no Supabase project or cookies are involved.
 */
export async function createClient(): Promise<SupabaseClient> {
  if (getDataMode() === 'json') {
    return createMockServerClient() as unknown as SupabaseClient
  }

  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // The "setAll" method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  ) as unknown as SupabaseClient
}
