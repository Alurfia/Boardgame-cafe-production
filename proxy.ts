import { NextResponse, type NextRequest } from "next/server"

import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session"

const LOGIN_PATH = "/admin/login"

/**
 * Gates `/admin` behind a valid session cookie. The kiosk stays open — a
 * customer must never hit a login screen.
 *
 * This protects the dashboard UI, not the data. Every table except `app_users`
 * is readable and writable with the public anon key by design (see
 * `scripts/001_create_tables.sql`), so this is a staff-vs-customer boundary,
 * not a security boundary against someone with devtools.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value
  const session = await verifySessionToken(token)

  if (pathname === LOGIN_PATH) {
    if (!session) return NextResponse.next()
    // Already signed in — skip the form.
    return NextResponse.redirect(new URL("/admin", request.url))
  }

  if (session) return NextResponse.next()

  const loginUrl = new URL(LOGIN_PATH, request.url)
  if (pathname !== "/admin") loginUrl.searchParams.set("next", `${pathname}${search}`)

  const response = NextResponse.redirect(loginUrl)
  // Clear an expired or tampered cookie so the next request starts clean.
  if (token) response.cookies.delete(ADMIN_COOKIE_NAME)
  return response
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
}
