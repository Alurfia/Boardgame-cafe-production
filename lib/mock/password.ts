import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

/**
 * Password hashing for `json` mode only.
 *
 * `db` mode hashes with bcrypt inside Postgres (`extensions.crypt`), which the
 * mock has no equivalent for, so this uses Node's built-in scrypt and its own
 * `scrypt$<salt>$<hash>` format. The formats deliberately differ — the two
 * databases are separate, and the mock only has to mirror *behaviour*: a hash
 * that never leaves the store, and a verify step that returns id/username/role.
 *
 * Node-only. Never import this from a client component.
 */

const KEY_LENGTH = 64
const SALT_BYTES = 16
const PREFIX = "scrypt"

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES)
  const derived = scryptSync(password, salt, KEY_LENGTH)
  return `${PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [prefix, saltHex, hashHex] = stored.split("$")
  if (prefix !== PREFIX || !saltHex || !hashHex) return false

  try {
    const expected = Buffer.from(hashHex, "hex")
    if (expected.length !== KEY_LENGTH) return false

    const derived = scryptSync(password, Buffer.from(saltHex, "hex"), KEY_LENGTH)
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
