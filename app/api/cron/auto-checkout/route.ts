import { NextResponse, type NextRequest } from "next/server"

import { getAdminSession } from "@/lib/auth/server"
import { runAutoCheckout } from "@/lib/auto-checkout"
import { createClient } from "@/lib/supabase/server"

/**
 * Closes sessions nobody checked out. Scheduled daily at 10:00 Asia/Bangkok by
 * `vercel.json` (03:00 UTC — Vercel cron expressions are always UTC), and safe
 * to call by hand from a signed-in admin browser to sweep early.
 *
 * The work itself lives in `lib/auto-checkout.ts`; this handler is only the
 * door. Both verbs do the same thing — Vercel Cron sends `GET`, a manual
 * `fetch` from the dashboard sends `POST`.
 */

export const dynamic = "force-dynamic"

/**
 * Vercel attaches `Authorization: Bearer $CRON_SECRET` to scheduled requests
 * when that variable is set, which is the only thing separating the cron from
 * anyone who can guess the URL. Without a secret the route stays open in
 * development and closes in production, so a missing variable fails safe.
 */
async function isAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim()

  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true
  if (await getAdminSession()) return true

  return !secret && process.env.NODE_ENV !== "production"
}

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = await createClient()
    const report = await runAutoCheckout(supabase)
    return NextResponse.json(report)
  } catch (error) {
    // A cron failure is invisible unless it is loud — Vercel only records the
    // status code, so put the reason in the body and the log.
    const message = error instanceof Error ? error.message : "Auto checkout failed"
    console.error("[auto-checkout]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request)
}
