"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  currentBusinessDayKey,
  formatDayKeyLabel,
  formatMonthKeyLabel,
  sessionBusinessDayKey,
  shiftDayKey,
} from "@/lib/business-day"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, DollarSign, Users, ShoppingBag } from "lucide-react"
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import type { Session } from "@/lib/types"

const supabase = createClient()

interface SummaryData {
  todayRevenue: number
  todaySessions: number
  todayMembers: number
  monthRevenue: number
  monthSessions: number
  monthMembers: number
  yearRevenue: number
  yearSessions: number
  yearMembers: number
  dailyData: Array<{ label: string; revenue: number; sessions: number }>
  monthlyData: Array<{ label: string; revenue: number; sessions: number }>
  yearlyData: Array<{ label: string; revenue: number; sessions: number }>
  snackSalesData: Array<{ name: string; quantity: number; revenue: number }>
}

type SummaryRange = "daily" | "monthly" | "yearly"

interface SummaryPanelProps {
  /** Bump to re-run the aggregates, e.g. after a session is edited or deleted. */
  refreshKey?: number
}

export function SummaryPanel({ refreshKey = 0 }: SummaryPanelProps) {
  const [summaryData, setSummaryData] = useState<SummaryData>({
    todayRevenue: 0,
    todaySessions: 0,
    todayMembers: 0,
    monthRevenue: 0,
    monthSessions: 0,
    monthMembers: 0,
    yearRevenue: 0,
    yearSessions: 0,
    yearMembers: 0,
    dailyData: [],
    monthlyData: [],
    yearlyData: [],
    snackSalesData: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [range, setRange] = useState<SummaryRange>("daily")

  useEffect(() => {
    fetchSummaryData()
  }, [refreshKey])

  async function fetchSummaryData() {
    setIsLoading(true)
    try {
      // Fetch all checked out sessions
      const { data: sessions } = await supabase
        .from("sessions")
        .select("*")
        .eq("status", "checked_out")
        .order("ended_at", { ascending: false })

      // Fetch all session snacks
      const { data: sessionSnacks } = await supabase
        .from("session_snacks")
        .select("*, snacks(name)")

      const allSessions = (sessions ?? []) as Session[]
      const allSnacks = (sessionSnacks ?? []) as any[]

      // Every figure below is bucketed by the *business day the session checked
      // in on* — `lib/business-day.ts`, the 10:00 cutoff. The history tab counts
      // the same way, so its per-day revenue matches the "today" tile here.
      const todayKey = currentBusinessDayKey()
      const monthKey = todayKey.slice(0, 7)
      const yearKey = todayKey.slice(0, 4)

      // A session whose check-in will not parse has no day to land on; counting
      // it would only smear it across whichever bucket `Invalid Date` produced.
      const dayKeys = new Map<string, string>()
      for (const session of allSessions) {
        const key = sessionBusinessDayKey(session)
        if (key) dayKeys.set(session.id, key)
      }
      const dated = allSessions.filter((s) => dayKeys.has(s.id))

      const sumRevenue = (rows: Session[]) =>
        rows.reduce((sum, s) => sum + (Number(s.total_cost) || 0), 0)
      const sumMembers = (rows: Session[]) =>
        rows.reduce((sum, s) => sum + (s.member_count || 1), 0)

      // Calculate today's stats
      const todaySessions = dated.filter((s) => dayKeys.get(s.id) === todayKey)
      const todayRevenue = sumRevenue(todaySessions)
      const todayMembers = sumMembers(todaySessions)

      // Calculate month's stats
      const monthSessions = dated.filter((s) => dayKeys.get(s.id)!.slice(0, 7) === monthKey)
      const monthRevenue = sumRevenue(monthSessions)
      const monthMembers = sumMembers(monthSessions)

      // Calculate year's stats
      const yearSessions = dated.filter((s) => dayKeys.get(s.id)!.slice(0, 4) === yearKey)
      const yearRevenue = sumRevenue(yearSessions)
      const yearMembers = sumMembers(yearSessions)

      // Calculate daily data for the last 30 business days
      const dailyMap: Record<string, { label: string; revenue: number; sessions: number }> = {}
      for (let i = 29; i >= 0; i--) {
        const key = shiftDayKey(todayKey, -i)
        dailyMap[key] = { label: formatDayKeyLabel(key), revenue: 0, sessions: 0 }
      }

      // Calculate monthly data for the last 12 months
      const monthlyMap: Record<string, { label: string; revenue: number; sessions: number }> = {}
      const monthCursor = new Date(`${monthKey}-01T00:00:00Z`)
      for (let i = 11; i >= 0; i--) {
        const date = new Date(
          Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth() - i, 1),
        )
        const key = date.toISOString().slice(0, 7)
        monthlyMap[key] = { label: formatMonthKeyLabel(key), revenue: 0, sessions: 0 }
      }

      // Calculate yearly data for the last 5 years
      const yearlyMap: Record<string, { label: string; revenue: number; sessions: number }> = {}
      for (let i = 4; i >= 0; i--) {
        const year = String(Number(yearKey) - i)
        yearlyMap[year] = { label: year, revenue: 0, sessions: 0 }
      }

      dated.forEach((session) => {
        const dayKey = dayKeys.get(session.id)!
        const revenue = Number(session.total_cost) || 0

        for (const bucket of [
          dailyMap[dayKey],
          monthlyMap[dayKey.slice(0, 7)],
          yearlyMap[dayKey.slice(0, 4)],
        ]) {
          if (!bucket) continue
          bucket.revenue += revenue
          bucket.sessions += 1
        }
      })

      const dailyData = Object.values(dailyMap).map((data) => ({
        label: data.label,
        revenue: Math.round(data.revenue * 100) / 100,
        sessions: data.sessions,
      }))

      const monthlyData = Object.values(monthlyMap).map((data) => ({
        label: data.label,
        revenue: Math.round(data.revenue * 100) / 100,
        sessions: data.sessions,
      }))

      const yearlyData = Object.values(yearlyMap).map((data) => ({
        label: data.label,
        revenue: Math.round(data.revenue * 100) / 100,
        sessions: data.sessions,
      }))

      // Calculate snack sales data
      const snackMap: Record<string, { quantity: number; revenue: number }> = {}
      allSnacks.forEach((snack) => {
        const snackName = (snack.snacks as any)?.name || "Unknown"
        if (!snackMap[snackName]) {
          snackMap[snackName] = { quantity: 0, revenue: 0 }
        }
        snackMap[snackName].quantity += snack.quantity
        snackMap[snackName].revenue += snack.quantity * Number(snack.price_at_time)
      })

      const snackSalesData = Object.entries(snackMap)
        .map(([name, data]) => ({
          name,
          quantity: data.quantity,
          revenue: Math.round(data.revenue * 100) / 100,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)

      setSummaryData({
        todayRevenue: Math.round(todayRevenue * 100) / 100,
        todaySessions: todaySessions.length,
        todayMembers,
        monthRevenue: Math.round(monthRevenue * 100) / 100,
        monthSessions: monthSessions.length,
        monthMembers,
        yearRevenue: Math.round(yearRevenue * 100) / 100,
        yearSessions: yearSessions.length,
        yearMembers,
        dailyData,
        monthlyData,
        yearlyData,
        snackSalesData,
      })
    } catch (error) {
      console.error("Error fetching summary data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const COLORS = ["#3b82f6", "#ec4899", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4", "#6366f1", "#14b8a6", "#f97316"]

  const chartData =
    range === "daily"
      ? summaryData.dailyData
      : range === "monthly"
        ? summaryData.monthlyData
        : summaryData.yearlyData

  const selectedSummary =
    range === "daily"
      ? {
          label: "Daily",
          revenue: summaryData.todayRevenue,
          sessions: summaryData.todaySessions,
          members: summaryData.todayMembers,
          description: "Today",
        }
      : range === "monthly"
        ? {
            label: "Monthly",
            revenue: summaryData.monthRevenue,
            sessions: summaryData.monthSessions,
            members: summaryData.monthMembers,
            description: "This month",
          }
        : {
            label: "Yearly",
            revenue: summaryData.yearRevenue,
            sessions: summaryData.yearSessions,
            members: summaryData.yearMembers,
            description: "This year",
          }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Today's Revenue */}
        <Card className="overflow-hidden border-border/50 shadow-lg">
          <div className="h-1 w-full gradient-primary" />
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground sm:text-sm">
                Today's Revenue
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground sm:text-3xl">
              ฿{summaryData.todayRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {summaryData.todaySessions} sessions
            </p>
          </CardContent>
        </Card>

        {/* Month's Revenue */}
        <Card className="overflow-hidden border-border/50 shadow-lg">
          <div className="h-1 w-full gradient-accent" />
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground sm:text-sm">
                Month's Revenue
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <TrendingUp className="h-4 w-4 text-accent" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground sm:text-3xl">
              ฿{summaryData.monthRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {summaryData.monthSessions} sessions
            </p>
          </CardContent>
        </Card>

        {/* Year's Revenue */}
        <Card className="overflow-hidden border-border/50 shadow-lg">
          <div className="h-1 w-full gradient-secondary" />
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground sm:text-sm">
                Year's Revenue
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10">
                <DollarSign className="h-4 w-4 text-secondary-foreground" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground sm:text-3xl">
              ฿{summaryData.yearRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {summaryData.yearSessions} sessions
            </p>
          </CardContent>
        </Card>

        {/* Today's Members */}
        <Card className="overflow-hidden border-border/50 shadow-lg">
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-purple-500" />
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground sm:text-sm">
                {selectedSummary.label} Members
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground sm:text-3xl">
              {selectedSummary.members}
            </p>
            <p className="text-xs text-muted-foreground">
              across {selectedSummary.sessions} sessions ({selectedSummary.description})
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Daily / Monthly / Yearly Chart */}
        <Card className="overflow-hidden border-border/50 shadow-lg">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base text-foreground sm:text-lg">
                Revenue & Sessions Trend
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {selectedSummary.label} View
              </Badge>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              View daily, monthly, and yearly performance in one chart
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                size="sm"
                variant={range === "daily" ? "default" : "outline"}
                onClick={() => setRange("daily")}
              >
                Daily
              </Button>
              <Button
                type="button"
                size="sm"
                variant={range === "monthly" ? "default" : "outline"}
                onClick={() => setRange("monthly")}
              >
                Monthly
              </Button>
              <Button
                type="button"
                size="sm"
                variant={range === "yearly" ? "default" : "outline"}
                onClick={() => setRange("yearly")}
              >
                Yearly
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-80 items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading summary chart...</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    stroke="hsl(var(--border))"
                  />
                  <YAxis
                    yAxisId="revenue"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    stroke="hsl(var(--border))"
                    tickFormatter={(value) => `฿${Number(value).toLocaleString()}`}
                  />
                  <YAxis
                    yAxisId="sessions"
                    orientation="right"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    stroke="hsl(var(--border))"
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                    }}
                    formatter={(value, name) =>
                      name === "Revenue"
                        ? `฿${Number(value).toFixed(2)}`
                        : Number(value).toLocaleString()
                    }
                  />
                  <Legend />
                  <Bar yAxisId="sessions" dataKey="sessions" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="Sessions" />
                  <Line
                    yAxisId="revenue"
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    name="Revenue"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Snacks Chart */}
        <Card className="overflow-hidden border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="text-base text-foreground sm:text-lg">
              Top Snacks by Revenue
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Best-selling snacks
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryData.snackSalesData.length === 0 ? (
              <div className="flex h-80 items-center justify-center">
                <p className="text-sm text-muted-foreground">No snack data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={summaryData.snackSalesData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, revenue }) => `${name}: ฿${revenue}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="revenue"
                  >
                    {summaryData.snackSalesData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: "var(--background)",
                      border: "1px solid var(--border)",
                      color: "#ffffff",
                    }}
                    formatter={(value) => `฿${Number(value).toFixed(2)}`} 
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Snack Sales Details */}
      <Card className="overflow-hidden border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-foreground sm:text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 shadow-sm">
              <ShoppingBag className="h-4 w-4 text-accent" />
            </div>
            Snack Sales Details
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Detailed breakdown of all snack sales
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summaryData.snackSalesData.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                <ShoppingBag className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No snack sales yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-4 gap-2 border-b border-border pb-2">
                <p className="text-xs font-semibold text-muted-foreground">Snack Name</p>
                <p className="text-right text-xs font-semibold text-muted-foreground">Qty</p>
                <p className="text-right text-xs font-semibold text-muted-foreground">Revenue</p>
                <p className="text-right text-xs font-semibold text-muted-foreground">% of Total</p>
              </div>
              {summaryData.snackSalesData.map((snack, index) => {
                const totalRevenue = summaryData.snackSalesData.reduce((sum, s) => sum + s.revenue, 0)
                const percentage = ((snack.revenue / totalRevenue) * 100).toFixed(1)
                return (
                  <div key={index} className="grid grid-cols-4 gap-2 rounded-lg bg-muted/30 p-2">
                    <p className="truncate text-xs font-medium text-foreground">{snack.name}</p>
                    <p className="text-right text-xs font-medium text-foreground">{snack.quantity}</p>
                    <p className="text-right text-xs font-semibold text-primary">
                      ฿{snack.revenue.toFixed(2)}
                    </p>
                    <p className="text-right text-xs font-medium text-muted-foreground">
                      {percentage}%
                    </p>
                  </div>
                )
              })}
              <div className="border-t border-border pt-3 mt-3">
                <div className="grid grid-cols-4 gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">Total</p>
                  <p className="text-right text-xs font-semibold text-foreground">
                    {summaryData.snackSalesData.reduce((sum, s) => sum + s.quantity, 0)}
                  </p>
                  <p className="text-right text-xs font-bold text-primary">
                    ฿{summaryData.snackSalesData.reduce((sum, s) => sum + s.revenue, 0).toFixed(2)}
                  </p>
                  <p className="text-right text-xs font-semibold text-muted-foreground">
                    100%
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
