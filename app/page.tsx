"use client"

import Image from "next/image"
import Link from "next/link"
import { LayoutDashboard, Monitor, Clock, Cookie, DollarSign, Sparkles, ArrowRight, Zap } from "lucide-react"

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center mesh-gradient px-4 py-12 sm:px-6">
      {/* Dot pattern overlay */}
      <div className="pointer-events-none fixed inset-0 dot-pattern" />

      {/* Floating decorative orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl float" />
        <div className="absolute -right-20 top-40 h-56 w-56 rounded-full bg-accent/10 blur-3xl float" style={{ animationDelay: '-2s' }} />
        <div className="absolute -bottom-20 left-1/3 h-64 w-64 rounded-full bg-primary/8 blur-3xl float" style={{ animationDelay: '-4s' }} />
        <div className="absolute -bottom-10 right-1/4 h-48 w-48 rounded-full bg-accent/8 blur-3xl float" style={{ animationDelay: '-3s' }} />
      </div>

      {/* Floating game pieces */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* Dice */}
        <svg className="absolute left-[8%] top-[15%] h-12 w-12 text-primary/20 float-rotate" style={{ animationDelay: '0s' }} viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" fill="#1e3a5f" />
          <circle cx="12" cy="12" r="1.5" fill="#1e3a5f" />
          <circle cx="16" cy="16" r="1.5" fill="#1e3a5f" />
        </svg>
        
        {/* Chess Knight */}
        <svg className="absolute right-[10%] top-[20%] h-10 w-10 text-accent/15 float-rotate" style={{ animationDelay: '-2s' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 22H5v-2h14v2m-3-4H8l.5-2H7V9a2 2 0 0 1 2-2h1V5h-.5c-.28 0-.5-.22-.5-.5V4c0-.28.22-.5.5-.5H12l1 1h1.5c.83 0 1.5.67 1.5 1.5v2c0 .83-.67 1.5-1.5 1.5H13l1 3h.5a.5.5 0 0 1 .5.5V15h1l.5 3z" />
        </svg>
        
        {/* Playing Card */}
        <svg className="absolute left-[15%] bottom-[25%] h-14 w-14 text-primary/15 float-rotate" style={{ animationDelay: '-4s' }} viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M12 6l1.5 3 3.5.5-2.5 2.5.5 3.5L12 14l-3 1.5.5-3.5L7 9.5 10.5 9 12 6z" fill="#1e3a5f" />
        </svg>
        
        {/* Puzzle Piece */}
        <svg className="absolute right-[12%] bottom-[30%] h-11 w-11 text-accent/20 float-rotate" style={{ animationDelay: '-1s' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z" />
        </svg>
        
        {/* Meeple */}
        <svg className="absolute left-[5%] top-[55%] h-9 w-9 text-primary/20 float-rotate" style={{ animationDelay: '-3s' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C10.34 2 9 3.34 9 5c0 1.3.84 2.4 2 2.82V9H8.5c-.83 0-1.5.67-1.5 1.5S7.67 12 8.5 12H9v1H5v9h14v-9h-4v-1h.5c.83 0 1.5-.67 1.5-1.5S16.33 9 15.5 9H13V7.82c1.16-.42 2-1.52 2-2.82 0-1.66-1.34-3-3-3z" />
        </svg>
        
        {/* Second Dice */}
        <svg className="absolute right-[5%] top-[50%] h-8 w-8 text-accent/15 float-rotate" style={{ animationDelay: '-5s' }} viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" fill="#1e3a5f" />
          <circle cx="16" cy="8" r="1.5" fill="#1e3a5f" />
          <circle cx="8" cy="16" r="1.5" fill="#1e3a5f" />
          <circle cx="16" cy="16" r="1.5" fill="#1e3a5f" />
        </svg>
        
        {/* Game Controller */}
        <svg className="absolute left-[25%] top-[8%] h-10 w-10 text-accent/15 float-rotate" style={{ animationDelay: '-6s' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M7.97 16L5 19c-1.5 1.5-4 .5-4-2V9c0-1.1.9-2 2-2h1.09c.53 0 1.04.21 1.41.59L9 11h6l3.5-3.41c.37-.38.88-.59 1.41-.59H21c1.1 0 2 .9 2 2v8c0 2.5-2.5 3.5-4 2l-2.97-3H7.97z" />
          <circle cx="8" cy="12" r="1" fill="#1e3a5f" />
          <circle cx="16" cy="12" r="1" fill="#1e3a5f" />
        </svg>
        
        {/* Star */}
        <svg className="absolute right-[22%] top-[10%] h-6 w-6 text-primary/25 twinkle" style={{ animationDelay: '0s' }} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        
        {/* Small Stars scattered */}
        <svg className="absolute left-[35%] top-[5%] h-4 w-4 text-accent/20 twinkle" style={{ animationDelay: '-1s' }} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <svg className="absolute right-[35%] bottom-[15%] h-5 w-5 text-primary/20 twinkle" style={{ animationDelay: '-2s' }} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <svg className="absolute left-[45%] bottom-[8%] h-3 w-3 text-accent/25 twinkle" style={{ animationDelay: '-3s' }} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>

      {/* Hero */}
      <div className="relative flex flex-col items-center gap-6 text-center slide-up">
        <div className="relative">
          <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-primary/25 to-accent/25 blur-2xl pulse-dot" />
          <div className="gradient-border relative">
            <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-xl glow-primary sm:h-28 sm:w-28">
              <Image
                src="/alurfia.jpg"
                alt="Alurfia logo"
                width={112}
                height={112}
                className="h-full w-full rounded-2xl object-cover"
                priority
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Alurfia in shelter
          </h1>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-primary/50" />
            <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1">
              <Zap className="h-3 w-3 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                Session Manager
              </p>
              <Zap className="h-3 w-3 text-primary" />
            </div>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-primary/50" />
          </div>
        </div>
        <p className="max-w-md text-pretty text-base leading-relaxed text-muted-foreground sm:max-w-lg sm:text-lg">
          Modern session management and self-service kiosk for your Alurfia in shelter.
        </p>
      </div>

      {/* Cards */}
      <div className="relative mt-12 flex w-full max-w-lg flex-col gap-5 sm:mt-16 sm:max-w-3xl sm:flex-row sm:gap-6">
        <Link
          href="/admin"
          className="group card-modern relative flex flex-1 flex-col gap-6 overflow-hidden rounded-2xl p-6 transition-all duration-300 hover-lift press-effect sm:p-8"
        >
          {/* Decorative gradient blob */}
          <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 transition-transform duration-500 group-hover:scale-150" />
          
          {/* Icon */}
          <div className="relative">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl">
              <LayoutDashboard className="h-7 w-7" />
            </div>
          </div>
          
          {/* Content */}
          <div className="relative flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <p className="text-xl font-semibold tracking-tight text-foreground">Admin Dashboard</p>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Manage active sessions, configure menu items, and set pricing.
            </p>
          </div>
          
          {/* Tags */}
          <div className="relative mt-auto flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-all group-hover:border-primary/30 group-hover:bg-primary/5 group-hover:text-primary">
              <Clock className="h-3 w-3" />
              Sessions
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-all group-hover:border-primary/30 group-hover:bg-primary/5 group-hover:text-primary">
              <Cookie className="h-3 w-3" />
              Snacks
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-all group-hover:border-primary/30 group-hover:bg-primary/5 group-hover:text-primary">
              <DollarSign className="h-3 w-3" />
              Pricing
            </span>
          </div>
        </Link>

        <Link
          href="/kiosk"
          className="group card-modern relative flex flex-1 flex-col gap-6 overflow-hidden rounded-2xl p-6 transition-all duration-300 hover-lift press-effect sm:p-8"
        >
          {/* Decorative gradient blob */}
          <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-accent/10 to-accent/5 transition-transform duration-500 group-hover:scale-150" />
          
          {/* Icon */}
          <div className="relative">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-accent text-accent-foreground shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl">
              <Monitor className="h-7 w-7" />
            </div>
          </div>
          
          {/* Content */}
          <div className="relative flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <p className="text-xl font-semibold tracking-tight text-foreground">Customer Kiosk</p>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-accent" />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Self-service check in, live session timer, and snack ordering.
            </p>
          </div>
          
          {/* Tags */}
          <div className="relative mt-auto flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-all group-hover:border-accent/30 group-hover:bg-accent/5 group-hover:text-accent">
              <Clock className="h-3 w-3" />
              Live Timer
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-all group-hover:border-accent/30 group-hover:bg-accent/5 group-hover:text-accent">
              <Cookie className="h-3 w-3" />
              Order
            </span>
          </div>
        </Link>
      </div>

      {/* Footer */}
      <div className="mt-14 flex flex-col items-center gap-3 sm:mt-20">
        <div className="flex items-center gap-3 rounded-full border border-border/50 bg-card/50 px-5 py-2.5 text-xs text-muted-foreground shadow-sm">
          <div className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </div>
          <span className="font-medium">Powered by Supabase Realtime</span>
          <Sparkles className="h-3 w-3 text-accent" />
        </div>
      </div>
    </main>
  )
}
