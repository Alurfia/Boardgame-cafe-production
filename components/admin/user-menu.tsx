"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, Shield, UserRound } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { UserRole } from "@/lib/auth/session"

interface UserMenuProps {
  username: string
  role: UserRole
}

/** Signed-in identity plus sign out, in the admin header. */
export function UserMenu({ username, role }: UserMenuProps) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const isAdmin = role === "admin"

  async function handleSignOut() {
    setSigningOut(true)
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" })
      if (!response.ok) throw new Error("logout failed")
      // Middleware bounces the refreshed request to the login page.
      router.refresh()
    } catch {
      toast.error("ออกจากระบบไม่สำเร็จ / Could not sign out")
      setSigningOut(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold shadow-sm ${
          isAdmin
            ? "border-accent/20 bg-accent/5 text-accent"
            : "border-primary/20 bg-primary/5 text-primary"
        }`}
      >
        {isAdmin ? <Shield className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
        <span className="max-w-[10rem] truncate">{username}</span>
        <span className="hidden text-[10px] font-medium uppercase tracking-wider opacity-70 sm:inline">
          {role}
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        disabled={signingOut}
        className="h-9 gap-1.5 rounded-xl border border-border/60 bg-card/80 px-3 text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive press-effect"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{signingOut ? "กำลังออก…" : "ออกจากระบบ"}</span>
      </Button>
    </div>
  )
}
