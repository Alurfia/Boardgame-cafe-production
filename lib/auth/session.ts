/**
 * Signed admin session cookie.
 *
 * Edge-safe on purpose — `middleware.ts` runs on the Edge runtime, so this
 * module uses Web Crypto only and must never import `node:crypto` or
 * `next/headers`. Cookie reading lives in `lib/auth/server.ts`.
 *
 * The token is `<base64url(payload)>.<base64url(hmac)>`. It is signed, not
 * encrypted: the payload is readable by anyone holding the cookie, so it
 * carries nothing beyond the user id, username and role.
 */

export type UserRole = "admin" | "staff"

export interface AdminSession {
  sub: string
  username: string
  role: UserRole
  /** Unix seconds. */
  exp: number
}

export const ADMIN_COOKIE_NAME = "admin_session"

/** One shift. Staff re-enter their password the next day. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

const DEV_FALLBACK_SECRET = "dev-only-insecure-admin-session-secret"

export function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "staff"
}

/**
 * A missing secret is fatal in production and merely loud in development, so a
 * clean checkout still boots with an empty `.env.local`.
 */
function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim()
  if (secret) return secret

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set. Set it to a long random string before deploying.",
    )
  }

  return DEV_FALLBACK_SECRET
}

/* -------------------------------------------------------------------------- */
/* base64url                                                                   */
/* -------------------------------------------------------------------------- */

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Signing                                                                     */
/* -------------------------------------------------------------------------- */

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

async function sign(payload: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(),
    new TextEncoder().encode(payload),
  )
  return toBase64Url(new Uint8Array(signature))
}

/** Constant-time so a wrong signature leaks nothing through timing. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createSessionToken(
  user: { id: string; username: string; role: UserRole },
  now: number = Date.now(),
): Promise<string> {
  const session: AdminSession = {
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS,
  }

  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(session)))
  return `${payload}.${await sign(payload)}`
}

/** Returns `null` for anything tampered with, malformed or expired. */
export async function verifySessionToken(
  token: string | undefined | null,
  now: number = Date.now(),
): Promise<AdminSession | null> {
  if (!token) return null

  const separator = token.lastIndexOf(".")
  if (separator <= 0) return null

  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)

  if (!equals(signature, await sign(payload))) return null

  const bytes = fromBase64Url(payload)
  if (!bytes) return null

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!parsed || typeof parsed !== "object") return null

    const session = parsed as AdminSession
    if (typeof session.sub !== "string" || typeof session.username !== "string") return null
    if (!isUserRole(session.role)) return null
    if (typeof session.exp !== "number" || session.exp * 1000 <= now) return null

    return session
  } catch {
    return null
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}
