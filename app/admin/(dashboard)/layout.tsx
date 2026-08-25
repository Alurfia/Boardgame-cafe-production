import React from "react"
import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { AdminChrome } from "@/components/admin/admin-chrome"
import { UserMenu } from "@/components/admin/user-menu"
import { getAdminSession } from "@/lib/auth/server"

/**
 * Chrome for the signed-in dashboard. `/admin/login` sits outside this route
 * group so it renders without the header.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Middleware already gated this, but a layout that renders staff identity
  // should not trust that alone.
  const session = await getAdminSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="min-h-dvh mesh-gradient">
      <AdminChrome />

      <header className="sticky top-0 z-50 glass">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/"
              className="group flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card/80 text-muted-foreground shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-card hover:text-foreground hover:shadow-md press-effect"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              <span className="sr-only">Back to home</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-md inner-glow">
                <Image
                  src="/alurfia.jpg"
                  alt="Alurfia logo"
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-xl object-cover"
                  priority
                />
              </div>
              <div className="flex flex-col">
                <h1 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
                  Admin Dashboard
                </h1>
                <p className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:block">
                  Alurfia in shelter
                </p>
              </div>
            </div>
          </div>
          <UserMenu username={session.username} role={session.role} />
        </div>
      </header>
      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 animate-in">
        {children}
      </main>
    </div>
  )
}
