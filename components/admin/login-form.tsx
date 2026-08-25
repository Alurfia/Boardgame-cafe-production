"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, Loader2, LogIn, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface LoginFormProps {
  /** Where to land after signing in. Same-origin paths only. */
  next: string
}

export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const body = (await response.json()) as { error?: string }

      if (!response.ok) {
        setError(body.error ?? "เข้าสู่ระบบไม่สำเร็จ / Could not sign in")
        setPassword("")
        setSubmitting(false)
        return
      }

      // The cookie is set; refresh so middleware and the layout see it.
      router.replace(next)
      router.refresh()
    } catch {
      setError("เชื่อมต่อไม่ได้ / Network error. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          ชื่อผู้ใช้ / Username
        </Label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="username"
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            disabled={submitting}
            className="h-11 pl-9"
            placeholder="admin"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          รหัสผ่าน / Password
        </Label>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            disabled={submitting}
            className="h-11 pl-9"
            placeholder="••••••••"
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="h-11 w-full gap-2 gradient-primary text-primary-foreground shadow-md press-effect"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            กำลังเข้าสู่ระบบ…
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" />
            เข้าสู่ระบบ / Sign in
          </>
        )}
      </Button>
    </form>
  )
}
