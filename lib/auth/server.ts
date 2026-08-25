import { cookies } from "next/headers"

import { ADMIN_COOKIE_NAME, verifySessionToken, type AdminSession } from "./session"

/**
 * Reads the admin session in a server component or route handler. Middleware
 * cannot use this (no `next/headers` on its request) — it verifies the token
 * off `request.cookies` instead.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies()
  return verifySessionToken(store.get(ADMIN_COOKIE_NAME)?.value)
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminSession())?.role === "admin"
}
