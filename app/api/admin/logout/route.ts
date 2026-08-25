import { NextResponse } from "next/server"

import { ADMIN_COOKIE_NAME } from "@/lib/auth/session"

/** Clears the admin session cookie. Middleware handles the redirect afterwards. */

export const dynamic = "force-dynamic"

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(ADMIN_COOKIE_NAME)
  return response
}
