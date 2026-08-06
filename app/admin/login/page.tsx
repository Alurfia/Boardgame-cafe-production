import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Shield } from "lucide-react"

import { AdminChrome } from "@/components/admin/admin-chrome"
import { LoginForm } from "@/components/admin/login-form"

export const dynamic = "force-dynamic"

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>
}

/**
 * Only same-origin admin paths are honoured, so a crafted `?next=` cannot
 * bounce staff to another site after they sign in.
 */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/admin") || value.startsWith("//")) return "/admin"
  return value === "/admin/login" ? "/admin" : value
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams

  return (
    <div className="relative min-h-dvh mesh-gradient">
      <AdminChrome />

      <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="group mb-6 inline-flex w-fit items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          กลับหน้าแรก / Back to home
        </Link>

        <div className="glass rounded-2xl border border-border/60 p-6 shadow-lg sm:p-8 slide-up">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary shadow-md inner-glow">
              <Image
                src="/alurfia.jpg"
                alt="Alurfia logo"
                width={48}
                height={48}
                className="h-12 w-12 rounded-xl object-cover"
                priority
              />
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                Admin Dashboard
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Alurfia in shelter
              </p>
            </div>
          </div>

          <p className="mb-6 flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5 text-xs text-accent">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            สำหรับพนักงานเท่านั้น / Staff only
          </p>

          <LoginForm next={safeNext(next)} />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ลูกค้าเช็คอินที่{" "}
          <Link href="/kiosk" className="font-medium text-primary hover:underline">
            หน้า Kiosk
          </Link>
        </p>
      </main>
    </div>
  )
}
