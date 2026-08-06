import { NextResponse } from "next/server"

import {
  ADMIN_COOKIE_NAME,
  createSessionToken,
  isUserRole,
  sessionCookieOptions,
} from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

/**
 * Verifies staff credentials and issues the admin session cookie.
 *
 * The password is only ever compared inside the database, by the SECURITY
 * DEFINER `verify_login` function — this handler never reads `app_users` and
 * never sees a hash. It runs server-side so the password never reaches a client
 * bundle or a Realtime payload.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface VerifiedUser {
  id: string
  username: string
  role: string
}

/** One message for every failure, so nobody can probe which usernames exist. */
const INVALID = "Incorrect username or password"

export async function POST(request: Request): Promise<NextResponse> {
  let username = ""
  let password = ""

  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== "object") throw new Error("not an object")
    const parsed = body as Record<string, unknown>
    username = typeof parsed.username === "string" ? parsed.username.trim() : ""
    password = typeof parsed.password === "string" ? parsed.password : ""
  } catch {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 })
  }

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("verify_login", {
    p_username: username,
    p_password: password,
  })

  if (error) {
    console.error("verify_login failed:", error)
    return NextResponse.json(
      { error: "Could not sign in right now. Please try again." },
      { status: 500 },
    )
  }

  // `RETURNS TABLE` comes back as an array — empty when the credentials miss.
  const user = (Array.isArray(data) ? data[0] : data) as VerifiedUser | undefined
  if (!user || !isUserRole(user.role)) {
    return NextResponse.json({ error: INVALID }, { status: 401 })
  }

  const response = NextResponse.json({ username: user.username, role: user.role })
  response.cookies.set(
    ADMIN_COOKIE_NAME,
    await createSessionToken({ id: user.id, username: user.username, role: user.role }),
    sessionCookieOptions(),
  )
  return response
}
