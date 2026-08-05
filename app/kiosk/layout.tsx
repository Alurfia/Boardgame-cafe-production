import React from "react"
import Image from "next/image"
import { Gamepad2, Facebook, Instagram } from "lucide-react"

export default function KioskLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh mesh-gradient">
      {/* Dot pattern overlay */}
      <div className="pointer-events-none fixed inset-0 dot-pattern" />

      {/* Floating decorative orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-20 h-64 w-64 rounded-full bg-primary/8 blur-3xl float" />
        <div className="absolute right-1/4 top-40 h-48 w-48 rounded-full bg-accent/8 blur-3xl float" style={{ animationDelay: '-2s' }} />
        <div className="absolute bottom-20 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/6 blur-3xl float" style={{ animationDelay: '-4s' }} />
      </div>

      {/* Floating game pieces */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* Dice */}
        <svg className="absolute left-[5%] top-[15%] h-10 w-10 text-primary/15 float-rotate" style={{ animationDelay: '0s' }} viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" fill="#658abb" />
          <circle cx="12" cy="12" r="1.5" fill="#819bbe" />
          <circle cx="16" cy="16" r="1.5" fill="#2a66b4" />
        </svg>
        
        {/* Chess Knight */}
        <svg className="absolute right-[8%] top-[32%] h-9 w-9 text-accent/12 float-rotate" style={{ animationDelay: '-2s' }} viewBox="0 0 24 24" fill="#416da7">
          <path d="M19 22H5v-2h14v2m-3-4H8l.5-2H7V9a2 2 0 0 1 2-2h1V5h-.5c-.28 0-.5-.22-.5-.5V4c0-.28.22-.5.5-.5H12l1 1h1.5c.83 0 1.5.67 1.5 1.5v2c0 .83-.67 1.5-1.5 1.5H13l1 3h.5a.5.5 0 0 1 .5.5V15h1l.5 3z" />
        </svg>
        
        {/* Puzzle Piece */}
        <svg className="absolute left-[8%] bottom-[30%] h-8 w-8 text-primary/12 float-rotate" style={{ animationDelay: '-4s' }} viewBox="0 0 24 24" fill="#416da7">
          <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z" />
        </svg>
        
        {/* Meeple */}
        <svg className="absolute right-[6%] bottom-[25%] h-8 w-8 text-accent/15 float-rotate" style={{ animationDelay: '-3s' }} viewBox="0 0 24 24" fill="#4a6fbf">
          <path d="M12 2C10.34 2 9 3.34 9 5c0 1.3.84 2.4 2 2.82V9H8.5c-.83 0-1.5.67-1.5 1.5S7.67 12 8.5 12H9v1H5v9h14v-9h-4v-1h.5c.83 0 1.5-.67 1.5-1.5S16.33 9 15.5 9H13V7.82c1.16-.42 2-1.52 2-2.82 0-1.66-1.34-3-3-3z" />
        </svg>
        
        {/* Stars */}
        <svg className="absolute left-[15%] top-[12%] h-5 w-5 text-accent/18 twinkle" style={{ animationDelay: '0s' }} viewBox="0 0 24 24" fill="#416da7">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <svg className="absolute right-[12%] bottom-[15%] h-4 w-4 text-primary/18 twinkle" style={{ animationDelay: '-1.5s' }} viewBox="0 0 24 24" fill="#416da7">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>

      <header className="sticky top-0 z-50 glass">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/alurfia.jpg"
              alt="Alurfia logo"
              width={40}
              height={40}
              className="h-10 w-10 rounded-sm object-cover"
              priority
            />
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
                Alurfia in shelter 
              </h1>
              <p className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:block">
                Self-Service check in
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs font-semibold text-primary shadow-sm">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <Gamepad2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Kiosk</span>
          </div>
        </div>
      </header>
      <main className="relative mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10 animate-in">
        {children}
      </main>

      <footer className="relative mx-auto w-full max-w-2xl px-4 pb-8 sm:px-6 sm:pb-10">
        <div className="mx-auto mb-4 h-px w-full max-w-xl bg-border/70" />
        <div className="flex flex-col items-center text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary sm:text-xs">
            Contact Info
          </p>
          <div className="mt-3 flex flex-col items-center gap-2.5 text-sm text-foreground">
            <div className="flex items-center justify-center gap-2.5">
              <Instagram className="h-4 w-4 text-primary" />
              <a
                href="https://www.instagram.com/alurfia.in.shelter/"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-primary"
              >
                @alurfia.in.shelter
              </a>
            </div>
            <div className="flex items-center justify-center gap-2.5">
              <Facebook className="h-4 w-4 text-primary" />
              <a
                href="https://www.facebook.com/AlurfiaInShelter/"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-primary"
              >
                Alurfia in shelter 
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
