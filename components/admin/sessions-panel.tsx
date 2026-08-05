"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  ESTIMATE_REFRESH_MS,
  calculateBillableHours,
  calculateFeePerPerson,
  calculateSessionTotal,
  roundCurrency,
} from "@/lib/billing"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Clock, DollarSign, LogOut, ShoppingBag, Users, Edit2, UserPlus, CheckCircle2, Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SessionSnacksList } from "./session-snacks-list"
import { ActiveTimer } from "./active-timer"
import type { Session, Snack, PricingConfig } from "@/lib/types"

const supabase = createClient()

interface SessionsPanelProps {
  activeSessions: Session[]
  checkedOutSessions: Session[]
  snacks: Snack[]
  pricing: PricingConfig
  onUpdate: () => void
}

interface CustomFinishedSnackRow {
  id: string
  name: string
  price: string
  quantity: string
}

/**
 * Time only for sessions that started today, date + time otherwise — a session
 * carrying the wrong date is otherwise indistinguishable from a normal one.
 */
function formatStartLabel(date: Date): string {
  if (Number.isNaN(date.getTime())) return "unknown"

  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  const today = new Date()
  const startedToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()

  return startedToday ? time : `${date.toLocaleDateString("en-GB")} ${time}`
}

/** Formats a date for a `datetime-local` input, which expects local time. */
function toLocalDateTimeValue(date: Date): string {
  const safe = Number.isNaN(date.getTime()) ? new Date() : date
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}T${pad(safe.getHours())}:${pad(safe.getMinutes())}`
}

function getNowLocalDateTimeValue(): string {
  return toLocalDateTimeValue(new Date())
}

export function SessionsPanel({
  activeSessions,
  checkedOutSessions,
  snacks,
  pricing,
  onUpdate,
}: SessionsPanelProps) {
  const getBillableHours = useCallback(
    (diffMs: number) => calculateBillableHours(diffMs, pricing.max_billable_hours),
    [pricing],
  )

  const [checkoutSession, setCheckoutSession] = useState<Session | null>(null)
  const [checkoutTotal, setCheckoutTotal] = useState<number>(0)
  const [checkoutMemberCount, setCheckoutMemberCount] = useState("1")
  const [checkoutBillableHours, setCheckoutBillableHours] = useState(0)
  const [checkoutSnackTotal, setCheckoutSnackTotal] = useState(0)
  const [checkoutSnackItems, setCheckoutSnackItems] = useState<{id: string; name: string; quantity: number; price_at_time: number}[]>([])
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [snackViewSession, setSnackViewSession] = useState<Session | null>(null)
  const [editMembersSession, setEditMembersSession] = useState<Session | null>(null)
  const [editMembersCount, setEditMembersCount] = useState("1")
  const [isUpdatingMembers, setIsUpdatingMembers] = useState(false)
  const [editTimeSession, setEditTimeSession] = useState<Session | null>(null)
  const [editTimeValue, setEditTimeValue] = useState("")
  const [isUpdatingTime, setIsUpdatingTime] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null)
  const [isDeletingSession, setIsDeletingSession] = useState(false)
  const [historyDetailSession, setHistoryDetailSession] = useState<Session | null>(null)
  const [historyDetailSnackItems, setHistoryDetailSnackItems] = useState<{id: string; name: string; quantity: number; price_at_time: number}[]>([])
  const [historyDetailSnackTotal, setHistoryDetailSnackTotal] = useState(0)
  const [isLoadingHistoryDetails, setIsLoadingHistoryDetails] = useState(false)
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false)
  const [newSessionName, setNewSessionName] = useState("")
  const [newSessionMembers, setNewSessionMembers] = useState("1")
  const [newSessionTimeIn, setNewSessionTimeIn] = useState(getNowLocalDateTimeValue())
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [isAddFinishedOpen, setIsAddFinishedOpen] = useState(false)
  const [finishedSessionName, setFinishedSessionName] = useState("")
  const [finishedSessionMembers, setFinishedSessionMembers] = useState("1")
  const [finishedSessionTimeIn, setFinishedSessionTimeIn] = useState(getNowLocalDateTimeValue())
  const [finishedSessionTimeOut, setFinishedSessionTimeOut] = useState(getNowLocalDateTimeValue())
  const [finishedSnackQtys, setFinishedSnackQtys] = useState<Record<string, string>>({})
  const [finishedCustomSnacks, setFinishedCustomSnacks] = useState<CustomFinishedSnackRow[]>([])
  const [isCreatingFinishedSession, setIsCreatingFinishedSession] = useState(false)

  const parsedCheckoutMembers = parseInt(checkoutMemberCount, 10)
  const checkoutMembersInvalid = !Number.isFinite(parsedCheckoutMembers) || parsedCheckoutMembers < 1
  const checkoutMembersForCalc = checkoutMembersInvalid ? 1 : parsedCheckoutMembers

  const parsedEditMembers = parseInt(editMembersCount, 10)
  const editMembersInvalid = !Number.isFinite(parsedEditMembers) || parsedEditMembers < 1

  const parsedNewMembers = parseInt(newSessionMembers, 10)
  const newMembersInvalid = !Number.isFinite(parsedNewMembers) || parsedNewMembers < 1

  const newTimeInDate = new Date(newSessionTimeIn)
  const newTimeInInFuture =
    !Number.isNaN(newTimeInDate.getTime()) && newTimeInDate.getTime() > Date.now()

  const editTimeDate = new Date(editTimeValue)
  const editTimeInvalid = Number.isNaN(editTimeDate.getTime())
  const editTimeInFuture = !editTimeInvalid && editTimeDate.getTime() > Date.now()

  const parsedFinishedMembers = parseInt(finishedSessionMembers, 10)
  const finishedMembersInvalid = !Number.isFinite(parsedFinishedMembers) || parsedFinishedMembers < 1
  const finishedMembersForCalc = finishedMembersInvalid ? 1 : parsedFinishedMembers

  const finishedTimeInDate = new Date(finishedSessionTimeIn)
  const finishedTimeOutDate = new Date(finishedSessionTimeOut)
  const finishedTimesValid =
    !Number.isNaN(finishedTimeInDate.getTime()) &&
    !Number.isNaN(finishedTimeOutDate.getTime()) &&
    finishedTimeOutDate.getTime() >= finishedTimeInDate.getTime()
  const finishedUsageMs = finishedTimesValid
    ? Math.max(0, finishedTimeOutDate.getTime() - finishedTimeInDate.getTime())
    : 0
  const finishedTimeOutInFuture =
    !Number.isNaN(finishedTimeOutDate.getTime()) && finishedTimeOutDate.getTime() > Date.now()
  const finishedUsageTotalMinutes = Math.floor(finishedUsageMs / (60 * 1000))
  const finishedBillableHours = getBillableHours(finishedUsageMs)

  const finishedStandardSnackRowsPreview = snacks
    .map((snack) => ({
      snack,
      quantity: Math.max(0, parseInt(finishedSnackQtys[snack.id] || "0", 10) || 0),
    }))
    .filter((entry) => entry.quantity > 0)

  const finishedCustomSnackRowsPreview = finishedCustomSnacks
    .map((row) => ({
      name: row.name.trim(),
      price: Number.parseFloat(row.price),
      quantity: Math.max(0, parseInt(row.quantity || "0", 10) || 0),
    }))
    .filter((entry) => entry.quantity > 0)

  const finishedCustomSnackInvalid = finishedCustomSnackRowsPreview.some(
    (entry) => !entry.name || !Number.isFinite(entry.price) || entry.price < 0
  )

  const finishedStandardSnackTotal = finishedStandardSnackRowsPreview.reduce(
    (sum, entry) => sum + entry.quantity * Number(entry.snack.price),
    0
  )
  const finishedCustomSnackTotal = finishedCustomSnackRowsPreview.reduce(
    (sum, entry) => sum + entry.quantity * entry.price,
    0
  )
  const finishedSessionFeeTotal =
    Number(pricing.base_fee) * finishedMembersForCalc +
    Number(pricing.hourly_rate) * finishedBillableHours * finishedMembersForCalc
  const finishedCalculatedTotal = calculateSessionTotal({
    baseFee: pricing.base_fee,
    hourlyRate: pricing.hourly_rate,
    billableHours: finishedBillableHours,
    memberCount: finishedMembersForCalc,
    snackTotal: finishedStandardSnackTotal + finishedCustomSnackTotal,
  })

  function getSessionTimeInDate(session: Session) {
    const timeIn = session.time_in || session.started_at
    return new Date(timeIn)
  }

  // Keep the checkout estimate current while the dialog is open
  useEffect(() => {
    if (!checkoutSession) return
    const interval = setInterval(() => {
      const now = new Date()
      const started = getSessionTimeInDate(checkoutSession)
      const diffMs = Math.max(0, now.getTime() - started.getTime())
      const billableHours = getBillableHours(diffMs)
      setCheckoutBillableHours(billableHours)
      setCheckoutTotal(
        calculateSessionTotal({
          baseFee: checkoutSession.base_fee,
          hourlyRate: checkoutSession.hourly_rate,
          billableHours,
          memberCount: checkoutMembersForCalc,
          snackTotal: checkoutSnackTotal,
        })
      )
    }, ESTIMATE_REFRESH_MS)
    return () => clearInterval(interval)
  }, [checkoutSession, checkoutMembersForCalc, checkoutSnackTotal, getBillableHours])

  // Filter to only show today's completed sessions
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayCheckedOutSessions = checkedOutSessions.filter((session) => {
    if (!session.ended_at) return false
    const endedDate = new Date(session.ended_at)
    endedDate.setHours(0, 0, 0, 0)
    return endedDate.getTime() === today.getTime()
  })

  async function handleCheckout(session: Session) {
    const now = new Date()
    const started = getSessionTimeInDate(session)
    const diffMs = Math.max(0, now.getTime() - started.getTime())
    const billableHours = getBillableHours(diffMs)

    const { data: sessionSnacksRaw } = await supabase
      .from("session_snacks")
      .select("id, quantity, price_at_time, snacks(name)")
      .eq("session_id", session.id)

    const sessionSnacks = (sessionSnacksRaw ?? []) as any[]
    const snackItems = sessionSnacks.map((s) => ({
      id: s.id as string,
      name: (s.snacks as any)?.name ?? "Unknown",
      quantity: s.quantity as number,
      price_at_time: Number(s.price_at_time),
    }))
    const snackTotal = snackItems.reduce((sum, s) => sum + s.quantity * s.price_at_time, 0)

    const members = session.member_count || 1

    setCheckoutBillableHours(billableHours)
    setCheckoutSnackItems(snackItems)
    setCheckoutSnackTotal(roundCurrency(snackTotal))
    setCheckoutTotal(
      calculateSessionTotal({
        baseFee: session.base_fee,
        hourlyRate: session.hourly_rate,
        billableHours,
        memberCount: members,
        snackTotal,
      })
    )
    setCheckoutSession(session)
    setCheckoutMemberCount(String(members))
  }

  async function refreshCheckoutSnacks(session: Session, members: number, billableHours: number) {
    const { data: sessionSnacksRaw } = await supabase
      .from("session_snacks")
      .select("id, quantity, price_at_time, snacks(name)")
      .eq("session_id", session.id)

    const snackItems = ((sessionSnacksRaw ?? []) as any[]).map((s) => ({
      id: s.id as string,
      name: (s.snacks as any)?.name ?? "Unknown",
      quantity: s.quantity as number,
      price_at_time: Number(s.price_at_time),
    }))
    const snackTotal = snackItems.reduce((sum, s) => sum + s.quantity * s.price_at_time, 0)

    setCheckoutSnackItems(snackItems)
    setCheckoutSnackTotal(roundCurrency(snackTotal))
    setCheckoutTotal(
      calculateSessionTotal({
        baseFee: session.base_fee,
        hourlyRate: session.hourly_rate,
        billableHours,
        memberCount: members,
        snackTotal,
      })
    )
  }

  async function confirmCheckout() {
    if (!checkoutSession) return
    if (checkoutMembersInvalid) {
      toast.error("Must be at least 1 person")
      return
    }

    const endedAtIso = new Date().toISOString()
    const startedAt = getSessionTimeInDate(checkoutSession)
    const endedAt = new Date(endedAtIso)
    const elapsedMs = Math.max(0, endedAt.getTime() - startedAt.getTime())
    const billableHours = getBillableHours(elapsedMs)
    const usedHours = Math.floor(elapsedMs / (60 * 60 * 1000))
    const usedMinutes = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000))
    const roundedTotal = calculateSessionTotal({
      baseFee: checkoutSession.base_fee,
      hourlyRate: checkoutSession.hourly_rate,
      billableHours,
      memberCount: checkoutMembersForCalc,
      snackTotal: checkoutSnackTotal,
    })

    setIsCheckingOut(true)
    try {
      const { error } = await supabase
        .from("sessions")
        .update({
          status: "checked_out",
          ended_at: endedAtIso,
          time_out: endedAtIso,
          used_hours: usedHours,
          used_minutes: usedMinutes,
          total_cost: roundedTotal,
          member_count: checkoutMembersForCalc,
        })
        .eq("id", checkoutSession.id)

      if (error) throw error
      toast.success(`${checkoutSession.customer_name} checked out successfully`)
      onUpdate()
    } catch {
      toast.error("Failed to checkout session")
    } finally {
      setIsCheckingOut(false)
      setCheckoutSession(null)
    }
  }

  async function updateMemberCount() {
    if (!editMembersSession) return
    if (editMembersInvalid) {
      toast.error("Must be at least 1 person")
      return
    }

    setIsUpdatingMembers(true)
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ member_count: parsedEditMembers })
        .eq("id", editMembersSession.id)

      if (error) throw error
      toast.success(`Updated member count to ${parsedEditMembers}`)
      onUpdate()
    } catch {
      toast.error("Failed to update member count")
    } finally {
      setIsUpdatingMembers(false)
      setEditMembersSession(null)
    }
  }

  function openEditMembersDialog(session: Session) {
    setEditMembersSession(session)
    setEditMembersCount(String(session.member_count || 1))
  }

  function openEditTimeDialog(session: Session) {
    setEditTimeValue(toLocalDateTimeValue(getSessionTimeInDate(session)))
    setEditTimeSession(session)
  }

  /**
   * Corrects a mistyped check-in time on an active session. Duration and the
   * running cost both derive from this, so they follow automatically.
   */
  async function updateCheckInTime() {
    if (!editTimeSession) return

    if (editTimeInvalid) {
      toast.error("Please enter valid time in")
      return
    }

    if (editTimeInFuture) {
      toast.error("Time in cannot be in the future", {
        description: "Check the date as well as the time.",
      })
      return
    }

    const timeInIso = editTimeDate.toISOString()

    setIsUpdatingTime(true)
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ started_at: timeInIso, time_in: timeInIso })
        .eq("id", editTimeSession.id)

      if (error) throw error
      toast.success("Check-in time updated")
      onUpdate()
    } catch {
      toast.error("Failed to update check-in time")
    } finally {
      setIsUpdatingTime(false)
      setEditTimeSession(null)
    }
  }

  async function confirmDeleteSession() {
    if (!sessionToDelete) return

    setIsDeletingSession(true)
    try {
      // session_snacks rows go with it via ON DELETE CASCADE.
      const { error } = await supabase.from("sessions").delete().eq("id", sessionToDelete.id)

      if (error) throw error

      // Close anything still pointing at the row that just disappeared.
      if (checkoutSession?.id === sessionToDelete.id) setCheckoutSession(null)
      if (snackViewSession?.id === sessionToDelete.id) setSnackViewSession(null)
      if (editMembersSession?.id === sessionToDelete.id) setEditMembersSession(null)
      if (editTimeSession?.id === sessionToDelete.id) setEditTimeSession(null)
      if (historyDetailSession?.id === sessionToDelete.id) setHistoryDetailSession(null)

      toast.success(`${sessionToDelete.customer_name} deleted`)
      onUpdate()
    } catch {
      toast.error("Failed to delete session")
    } finally {
      setIsDeletingSession(false)
      setSessionToDelete(null)
    }
  }

  async function openHistoryDetail(session: Session) {
    setHistoryDetailSession(session)
    setIsLoadingHistoryDetails(true)
    try {
      const { data: sessionSnacksRaw, error } = await supabase
        .from("session_snacks")
        .select("id, quantity, price_at_time, snacks(name)")
        .eq("session_id", session.id)

      if (error) throw error

      const snackItems = ((sessionSnacksRaw ?? []) as any[]).map((s) => ({
        id: s.id as string,
        name: (s.snacks as any)?.name ?? "Unknown",
        quantity: s.quantity as number,
        price_at_time: Number(s.price_at_time),
      }))
      const snackTotal = snackItems.reduce((sum, s) => sum + s.quantity * s.price_at_time, 0)

      setHistoryDetailSnackItems(snackItems)
      setHistoryDetailSnackTotal(Math.round(snackTotal * 100) / 100)
    } catch {
      setHistoryDetailSnackItems([])
      setHistoryDetailSnackTotal(0)
      toast.error("Failed to load order details")
    } finally {
      setIsLoadingHistoryDetails(false)
    }
  }

  async function createAdminSession() {
    if (!newSessionName.trim()) {
      toast.error("Please enter customer name")
      return
    }

    const members = parseInt(newSessionMembers, 10)
    if (!Number.isFinite(members) || members < 1) {
      toast.error("Must be at least 1 person")
      return
    }

    const timeInDate = new Date(newSessionTimeIn)
    if (Number.isNaN(timeInDate.getTime())) {
      toast.error("Please enter valid time in")
      return
    }

    if (timeInDate.getTime() > Date.now()) {
      toast.error("Time in cannot be in the future", {
        description: "Check the date as well as the time.",
      })
      return
    }

    const startedAt = timeInDate.toISOString()

    setIsCreatingSession(true)
    try {
      const normalizedName = newSessionName.trim().toLocaleLowerCase()
      const { data: activeNameRows, error: activeNameError } = await supabase
        .from("sessions")
        .select("customer_name")
        .eq("status", "active")

      if (activeNameError) throw activeNameError

      const duplicateActiveName = (activeNameRows ?? []).some(
        (row: { customer_name: string | null }) =>
          (row.customer_name ?? "").trim().toLocaleLowerCase() === normalizedName
      )

      if (duplicateActiveName) {
        toast.error("This name already has an active session", {
          description: "Please select another name.",
        })
        return
      }

      const { error } = await supabase
        .from("sessions")
        .insert({
          customer_name: newSessionName.trim(),
          member_count: members,
          status: "active",
          started_at: startedAt,
          time_in: startedAt,
          base_fee: pricing.base_fee,
          hourly_rate: pricing.hourly_rate,
        })

      if (error) throw error

      toast.success("Session added")
      setIsAddSessionOpen(false)
      setNewSessionName("")
      setNewSessionMembers("1")
      setNewSessionTimeIn(getNowLocalDateTimeValue())
      onUpdate()
    } catch (error: any) {
      if (error?.code === "23505") {
        toast.error("This name already has an active session", {
          description: "Please select another name.",
        })
        return
      }
      toast.error("Failed to add session")
    } finally {
      setIsCreatingSession(false)
    }
  }

  function openAddFinishedDialog() {
    const initialSnackQtys = snacks.reduce<Record<string, string>>((acc, snack) => {
      acc[snack.id] = "0"
      return acc
    }, {})

    setFinishedSessionName("")
    setFinishedSessionMembers("1")
    const now = getNowLocalDateTimeValue()
    setFinishedSessionTimeIn(now)
    setFinishedSessionTimeOut(now)
    setFinishedSnackQtys(initialSnackQtys)
    setFinishedCustomSnacks([])
    setIsAddFinishedOpen(true)
  }

  function addCustomFinishedSnackRow() {
    setFinishedCustomSnacks((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "",
        price: "",
        quantity: "1",
      },
    ])
  }

  function updateCustomFinishedSnackRow(
    id: string,
    field: "name" | "price" | "quantity",
    value: string
  ) {
    setFinishedCustomSnacks((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    )
  }

  function removeCustomFinishedSnackRow(id: string) {
    setFinishedCustomSnacks((prev) => prev.filter((row) => row.id !== id))
  }

  async function createFinishedSession() {
    if (!finishedSessionName.trim()) {
      toast.error("Please enter customer name")
      return
    }

    if (finishedMembersInvalid) {
      toast.error("Must be at least 1 person")
      return
    }

    const members = finishedMembersForCalc

    if (!finishedTimesValid) {
      toast.error("Please enter valid time in/out")
      return
    }

    if (finishedTimeOutDate.getTime() > Date.now()) {
      toast.error("Time out cannot be in the future", {
        description: "Check the date as well as the time.",
      })
      return
    }

    const sessionDate = finishedTimeInDate
    const sessionEndDate = finishedTimeOutDate
    const usageHours = Math.floor(finishedUsageTotalMinutes / 60)
    const usageMinutes = finishedUsageTotalMinutes % 60
    const billableHours = finishedBillableHours

    const snackRows = finishedStandardSnackRowsPreview

    const customSnackRows = finishedCustomSnackRowsPreview

    if (finishedCustomSnackInvalid) {
      toast.error("Please fill custom snack name and valid price")
      return
    }

    const total = finishedCalculatedTotal

    setIsCreatingFinishedSession(true)
    try {
      const { data, error } = await supabase
        .from("sessions")
        .insert({
          customer_name: finishedSessionName.trim(),
          member_count: members,
          status: "checked_out",
          started_at: sessionDate.toISOString(),
          ended_at: sessionEndDate.toISOString(),
          time_in: sessionDate.toISOString(),
          time_out: sessionEndDate.toISOString(),
          used_hours: usageHours,
          used_minutes: usageMinutes,
          base_fee: pricing.base_fee,
          hourly_rate: pricing.hourly_rate,
          total_cost: total,
        })
        .select("id")
        .single()

      if (error) throw error

      if (snackRows.length > 0) {
        const snackInsertRows = snackRows.map((entry) => ({
          session_id: data.id,
          snack_id: entry.snack.id,
          quantity: entry.quantity,
          price_at_time: entry.snack.price,
        }))

        const { error: snacksError } = await supabase
          .from("session_snacks")
          .insert(snackInsertRows)

        if (snacksError) throw snacksError
      }

      if (customSnackRows.length > 0) {
        const customSessionSnackRows: {
          session_id: string
          snack_id: string
          quantity: number
          price_at_time: number
        }[] = []

        for (const custom of customSnackRows) {
          let snackId = ""

          const { data: existingSnack, error: existingSnackError } = await supabase
            .from("snacks")
            .select("id")
            .ilike("name", custom.name)
            .limit(1)
            .maybeSingle()

          if (existingSnackError) throw existingSnackError

          if (existingSnack?.id) {
            snackId = existingSnack.id
          } else {
            const { data: insertedSnack, error: insertSnackError } = await supabase
              .from("snacks")
              .insert({ name: custom.name, price: custom.price, available: true })
              .select("id")
              .single()

            if (insertSnackError) throw insertSnackError
            snackId = insertedSnack.id
          }

          if (!snackId) {
            throw new Error("Failed to resolve snack id")
          }

          customSessionSnackRows.push({
            session_id: data.id,
            snack_id: snackId,
            quantity: custom.quantity,
            price_at_time: custom.price,
          })
        }

        if (customSessionSnackRows.length > 0) {
          const { error: customSnackRowsError } = await supabase
            .from("session_snacks")
            .insert(customSessionSnackRows)

          if (customSnackRowsError) throw customSnackRowsError
        }
      }

      toast.success("Finished session added")
      setIsAddFinishedOpen(false)
      onUpdate()
    } catch {
      toast.error("Failed to add finished session")
    } finally {
      setIsCreatingFinishedSession(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Active Sessions */}
      <Card className="overflow-hidden border-border/50 shadow-lg">
        <div className="h-1 w-full gradient-accent" />
        <CardHeader className="pb-3 sm:pb-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2 text-base text-foreground sm:text-lg">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl gradient-accent text-accent-foreground shadow-sm sm:h-9 sm:w-9">
                  <Clock className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                </div>
                Active Sessions
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {activeSessions.length} ลูกค้ากำลังเล่นอยู่
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {activeSessions.length > 0 && (
                <Badge variant="outline" className="gap-1.5 border-accent/30 bg-accent/10 px-3 py-1.5 text-accent">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  <Users className="h-3 w-3" />
                  {activeSessions.length} active
                </Badge>
              )}
              <Button
                size="sm"
                onClick={() => setIsAddSessionOpen(true)}
                className="gradient-primary text-xs text-primary-foreground shadow-sm transition-all hover:opacity-90"
              >
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">ไม่มีลูกค้าที่กำลังใช้บริการ</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                รายการจะแสดงเมื่อลูกค้าเช็คอินที่
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-all hover:border-accent/30 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  {/* Left: Customer info */}
                  <div className="flex flex-1 items-start gap-3 sm:items-center">
                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full gradient-primary text-sm font-bold text-primary-foreground shadow-sm">
                      {session.customer_name.charAt(0).toUpperCase()}
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-accent" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="font-semibold leading-tight text-foreground">
                        {session.customer_name}
                      </p>
                      <div className="flex items-center gap-1">
                        <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                          Started {formatStartLabel(getSessionTimeInDate(session))}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditTimeDialog(session)}
                        >
                          <Edit2 className="h-3 w-3" />
                          <span className="sr-only">Edit check-in time</span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Timer and cost */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-6">
                    <div className="flex flex-col items-start sm:items-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Duration
                      </p>
                      <ActiveTimer startedAt={session.time_in || session.started_at} />
                    </div>
                    <div className="flex flex-col items-start sm:items-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Est. Cost
                      </p>
                      <span className="timer-display text-sm font-semibold text-primary">
                        <EstimatedCost session={session} pricing={pricing} />
                      </span>
                    </div>
                    <div className="flex flex-col items-start sm:items-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Per Person
                      </p>
                      <span className="timer-display text-sm font-semibold text-foreground">
                        <FeePerPerson session={session} pricing={pricing} />
                      </span>
                      <p className="text-[10px] text-muted-foreground">ไม่รวม snack</p>
                    </div>
                    <div className="flex flex-col items-start sm:items-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Members
                      </p>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold text-foreground">
                          {session.member_count || 1}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => openEditMembersDialog(session)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 border-t border-border/50 pt-3 sm:border-t-0 sm:pt-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSnackViewSession(session)}
                      className="flex-1 border-border/50 bg-background text-xs transition-colors hover:bg-secondary sm:flex-none"
                    >
                      <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />
                      Snacks
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleCheckout(session)}
                      className="flex-1 gradient-primary text-xs text-primary-foreground shadow-sm transition-all hover:opacity-90 sm:flex-none"
                    >
                      <LogOut className="mr-1.5 h-3.5 w-3.5" />
                      Checkout
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSessionToDelete(session)}
                      className="h-9 w-9 shrink-0 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete session</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checkout History */}
      <Card className="overflow-hidden border-border/50 shadow-lg">
        <div className="h-1 w-full gradient-primary" />
        <CardHeader className="pb-3 sm:pb-6">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base text-foreground sm:text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-sm sm:h-9 sm:w-9">
                <DollarSign className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </div>
              ประวัติวันนี้
            </CardTitle>
            <Button
              size="sm"
              onClick={openAddFinishedDialog}
              className="gradient-primary text-xs text-primary-foreground shadow-sm transition-all hover:opacity-90"
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Add Finished
            </Button>
          </div>
          <CardDescription className="text-xs sm:text-sm">
            {todayCheckedOutSessions.length} รายการที่เช็คเอาท์แล้ววันนี้
          </CardDescription>
        </CardHeader>
        <CardContent>
          {todayCheckedOutSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                <DollarSign className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">วันนี้ยังไม่มีรายการที่เสร็จสิ้น</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                รายการที่เช็คเอาท์วันนี้จะแสดงที่นี่
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {todayCheckedOutSessions.map((session) => {
                const started = new Date(session.started_at)
                const ended = session.ended_at ? new Date(session.ended_at) : null
                const durationMs = ended ? Math.max(0, ended.getTime() - started.getTime()) : 0
                const hours = Math.floor(durationMs / (1000 * 60 * 60))
                const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))

                return (
                  <div
                    key={session.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openHistoryDetail(session)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        openHistoryDetail(session)
                      }
                    }}
                    className="flex cursor-pointer flex-col gap-2 rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                        {session.customer_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold leading-tight text-foreground">
                          {session.customer_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {started.toLocaleDateString("en-GB")} at {started.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 pl-13 sm:gap-6 sm:pl-0">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Duration
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {hours}h {minutes}m
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Total
                        </span>
                        <span className="timer-display text-sm font-bold text-primary">
                          ฿{Number(session.total_cost ?? 0).toFixed(2)}
                        </span>
                      </div>
                      <Badge variant="secondary" className="ml-auto text-[10px] sm:ml-0">
                        Completed
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSessionToDelete(session)
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="h-8 w-8 shrink-0 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete session</span>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Finished Session Dialog */}
      <Dialog open={isAddFinishedOpen} onOpenChange={setIsAddFinishedOpen}>
        <DialogContent className="mx-4 sm:mx-auto">
          <div className="absolute inset-x-0 top-0 h-1 gradient-primary" />
          <DialogHeader>
            <DialogTitle className="text-foreground">Add Finished Session</DialogTitle>
            <DialogDescription>
              Create a completed session with time in, time out, members, and snacks.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="finished-session-name">Customer Name</Label>
              <Input
                id="finished-session-name"
                value={finishedSessionName}
                onChange={(e) => setFinishedSessionName(e.target.value)}
                placeholder="Enter customer name"
                className="h-12 border-border/50 bg-secondary/30"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="finished-session-time-in">Time In</Label>
              <Input
                id="finished-session-time-in"
                type="datetime-local"
                value={finishedSessionTimeIn}
                onChange={(e) => setFinishedSessionTimeIn(e.target.value)}
                className="h-12 border-border/50 bg-secondary/30"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="finished-session-time-out">Time Out</Label>
              <Input
                id="finished-session-time-out"
                type="datetime-local"
                max={getNowLocalDateTimeValue()}
                value={finishedSessionTimeOut}
                onChange={(e) => setFinishedSessionTimeOut(e.target.value)}
                className="h-12 border-border/50 bg-secondary/30"
              />
              {!finishedTimesValid && (
                <p className="text-xs text-destructive">Time out must be after or equal to time in</p>
              )}
              {finishedTimeOutInFuture && (
                <p className="text-xs text-destructive">
                  Time out cannot be in the future — check the date too
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="finished-session-members">Number of Members</Label>
              <Input
                id="finished-session-members"
                type="number"
                min="1"
                value={finishedSessionMembers}
                onChange={(e) => setFinishedSessionMembers(e.target.value)}
                className="h-12 border-border/50 bg-secondary/30"
              />
              {finishedMembersInvalid && (
                <p className="text-xs text-destructive">Must be at least 1 person</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Snacks</Label>
              <div className="max-h-48 space-y-2 overflow-auto rounded-lg border border-border/50 bg-secondary/20 p-3">
                {snacks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No snacks available</p>
                ) : (
                  snacks.map((snack) => (
                    <div key={snack.id} className="grid grid-cols-[1fr_80px] items-center gap-2">
                      <p className="text-xs text-foreground sm:text-sm">
                        {snack.name} <span className="text-muted-foreground">(฿{Number(snack.price).toFixed(2)})</span>
                      </p>
                      <Input
                        type="number"
                        min="0"
                        value={finishedSnackQtys[snack.id] ?? "0"}
                        onChange={(e) => {
                          const value = e.target.value
                          setFinishedSnackQtys((prev) => ({ ...prev, [snack.id]: value }))
                        }}
                        onBlur={() => {
                          if ((finishedSnackQtys[snack.id] ?? "") === "") {
                            setFinishedSnackQtys((prev) => ({ ...prev, [snack.id]: "0" }))
                          }
                        }}
                        className="h-9 border-border/50 bg-background text-xs"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Custom Snacks (Add New)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCustomFinishedSnackRow}
                  className="h-8 border-border/50 bg-background text-xs"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Snack
                </Button>
              </div>
              {finishedCustomSnacks.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-auto rounded-lg border border-border/50 bg-secondary/20 p-3">
                  {finishedCustomSnacks.map((row) => (
                    <div key={row.id} className="grid grid-cols-[1fr_90px_70px_auto] items-center gap-2">
                      <Input
                        value={row.name}
                        placeholder="Snack name"
                        onChange={(e) => updateCustomFinishedSnackRow(row.id, "name", e.target.value)}
                        className="h-9 border-border/50 bg-background text-xs"
                      />
                      <Input
                        type="number"
                        min="0"
                        value={row.price}
                        placeholder="Price"
                        onChange={(e) => updateCustomFinishedSnackRow(row.id, "price", e.target.value)}
                        className="h-9 border-border/50 bg-background text-xs"
                      />
                      <Input
                        type="number"
                        min="0"
                        value={row.quantity}
                        placeholder="Qty"
                        onChange={(e) => updateCustomFinishedSnackRow(row.id, "quantity", e.target.value)}
                        className="h-9 border-border/50 bg-background text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCustomFinishedSnackRow(row.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 text-sm">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Calculated Price</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Session fee</span>
                  <span className="font-medium text-foreground">฿{finishedSessionFeeTotal.toFixed(2)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Base ฿{Number(pricing.base_fee).toFixed(2)} + hourly {finishedBillableHours.toFixed(2)}h × ฿{Number(pricing.hourly_rate).toFixed(2)} × {finishedMembersForCalc} member{finishedMembersForCalc > 1 ? "s" : ""}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Usage time: {Math.floor(finishedUsageTotalMinutes / 60)}h {finishedUsageTotalMinutes % 60}m
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Preset snacks</span>
                  <span className="font-medium text-foreground">฿{finishedStandardSnackTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Custom snacks</span>
                  <span className="font-medium text-foreground">฿{finishedCustomSnackTotal.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-border/40 pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</span>
                  <span className="timer-display text-xl font-bold text-primary">฿{finishedCalculatedTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setIsAddFinishedOpen(false)}
              className="w-full border-border/50 bg-background sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={createFinishedSession}
              disabled={isCreatingFinishedSession}
              className="w-full gradient-primary text-primary-foreground shadow-md transition-all hover:opacity-90 hover:shadow-lg sm:w-auto"
            >
              {isCreatingFinishedSession ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Creating...
                </span>
              ) : (
                "Add Finished"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout Confirmation Dialog */}
      <Dialog
        open={!!checkoutSession}
        onOpenChange={(open) => !open && setCheckoutSession(null)}
      >
        <DialogContent className="mx-4 max-w-md sm:mx-auto">
          <div className="absolute inset-x-0 top-0 h-1 gradient-primary" />
          <DialogHeader>
            <DialogTitle className="text-foreground">Confirm Checkout</DialogTitle>
            <DialogDescription>
              Complete the session for{" "}
              <span className="font-semibold text-foreground">
                {checkoutSession?.customer_name}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          
          {/* Edit Member Count */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="checkout-member-count" className="text-sm font-medium">
              Number of Members
            </Label>
            <Input
              id="checkout-member-count"
              type="number"
              min="1"
              value={checkoutMemberCount}
              onChange={(e) => {
                const raw = e.target.value
                setCheckoutMemberCount(raw)
                const members = parseInt(raw, 10)
                if (checkoutSession && Number.isFinite(members) && members >= 1) {
                  setCheckoutTotal(
                    calculateSessionTotal({
                      baseFee: checkoutSession.base_fee,
                      hourlyRate: checkoutSession.hourly_rate,
                      billableHours: checkoutBillableHours,
                      memberCount: members,
                      snackTotal: checkoutSnackTotal,
                    })
                  )
                }
              }}
              className="h-10 border-border/50 bg-secondary/30"
            />
            {checkoutMembersInvalid && (
              <p className="text-xs text-destructive">Must be at least 1 person</p>
            )}
          </div>
          
          {/* Snacks Ordered */}
          {checkoutSession && (
            <SessionSnacksList
              sessionId={checkoutSession.id}
              snacks={snacks}
              onUpdate={() => {
                onUpdate()
                refreshCheckoutSnacks(checkoutSession, checkoutMembersForCalc, checkoutBillableHours)
              }}
            />
          )}
          
          {/* Cost Breakdown */}
          {checkoutSession && (
            <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-secondary/10 p-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground">Cost Breakdown</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price per person</span>
                <span className="font-medium text-foreground">
                  ฿
                  {(Number(checkoutSession.base_fee) + Number(checkoutSession.hourly_rate) * checkoutBillableHours).toFixed(2)}
                  /person
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Session fee ({checkoutMembersForCalc} person{checkoutMembersForCalc > 1 ? "s" : ""})
                </span>
                <span className="font-medium text-foreground">
                  ฿
                  {(
                    (Number(checkoutSession.base_fee) + Number(checkoutSession.hourly_rate) * checkoutBillableHours) *
                    checkoutMembersForCalc
                  ).toFixed(2)}
                </span>
              </div>
              {checkoutSnackItems.length > 0 && (
                <>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wider text-foreground">Snacks</p>
                  {checkoutSnackItems.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {item.name} × {item.quantity}
                      </span>
                      <span className="font-medium text-foreground">
                        ฿{(item.quantity * item.price_at_time).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-border/30 pt-1">
                    <span className="text-muted-foreground">Snack total</span>
                    <span className="font-medium text-foreground">฿{checkoutSnackTotal.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="mt-1 border-t border-border/50 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Amount</span>
                  <span className="timer-display text-2xl font-bold text-primary">฿{checkoutTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setCheckoutSession(null)}
              className="w-full border-border/50 bg-background sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmCheckout}
              disabled={isCheckingOut}
              className="w-full gradient-primary text-primary-foreground shadow-md transition-all hover:opacity-90 hover:shadow-lg sm:w-auto"
            >
              {isCheckingOut ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Processing...
                </span>
              ) : (
                "Confirm Checkout"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Snacks View Dialog */}
      <Dialog
        open={!!snackViewSession}
        onOpenChange={(open) => !open && setSnackViewSession(null)}
      >
        <DialogContent className="mx-4 max-w-md sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Snacks for {snackViewSession?.customer_name}
            </DialogTitle>
            <DialogDescription>
              View and manage snacks ordered during this session.
            </DialogDescription>
          </DialogHeader>
          {snackViewSession && (
            <SessionSnacksList
              sessionId={snackViewSession.id}
              snacks={snacks}
              onUpdate={onUpdate}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Members Dialog */}
      <Dialog
        open={!!editMembersSession}
        onOpenChange={(open) => !open && setEditMembersSession(null)}
      >
        <DialogContent className="mx-4 sm:mx-auto">
          <div className="absolute inset-x-0 top-0 h-1 gradient-accent" />
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Member Count</DialogTitle>
            <DialogDescription>
              Update the number of members for {editMembersSession?.customer_name}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="member-count-edit">Number of Members</Label>
              <Input
                id="member-count-edit"
                type="number"
                min="1"
                value={editMembersCount}
                onChange={(e) => setEditMembersCount(e.target.value)}
                className="h-12 border-border/50 bg-secondary/30"
              />
              {editMembersInvalid && (
                <p className="text-xs text-destructive">Must be at least 1 person</p>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setEditMembersSession(null)}
              className="w-full border-border/50 bg-background sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={updateMemberCount}
              disabled={isUpdatingMembers}
              className="w-full gradient-accent text-accent-foreground shadow-md transition-all hover:opacity-90 hover:shadow-lg sm:w-auto"
            >
              {isUpdatingMembers ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground border-t-transparent" />
                  Updating...
                </span>
              ) : (
                "Update Members"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Check-in Time Dialog */}
      <Dialog
        open={!!editTimeSession}
        onOpenChange={(open) => !open && setEditTimeSession(null)}
      >
        <DialogContent className="mx-4 sm:mx-auto">
          <div className="absolute inset-x-0 top-0 h-1 gradient-accent" />
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Check-in Time</DialogTitle>
            <DialogDescription>
              Update when {editTimeSession?.customer_name} checked in. Duration and cost are
              recalculated from this time.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-session-time-in">Time In</Label>
              <Input
                id="edit-session-time-in"
                type="datetime-local"
                max={getNowLocalDateTimeValue()}
                value={editTimeValue}
                onChange={(e) => setEditTimeValue(e.target.value)}
                className="h-12 border-border/50 bg-secondary/30"
              />
              {editTimeInvalid && (
                <p className="text-xs text-destructive">Please enter a valid time</p>
              )}
              {editTimeInFuture && (
                <p className="text-xs text-destructive">
                  Time in cannot be in the future — check the date too
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setEditTimeSession(null)}
              className="w-full border-border/50 bg-background sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={updateCheckInTime}
              disabled={isUpdatingTime || editTimeInvalid || editTimeInFuture}
              className="w-full gradient-accent text-accent-foreground shadow-md transition-all hover:opacity-90 hover:shadow-lg sm:w-auto"
            >
              {isUpdatingTime ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground border-t-transparent" />
                  Updating...
                </span>
              ) : (
                "Update Time"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Session Dialog */}
      <Dialog
        open={!!sessionToDelete}
        onOpenChange={(open) => !open && setSessionToDelete(null)}
      >
        <DialogContent className="mx-4 max-w-md sm:mx-auto">
          <div className="absolute inset-x-0 top-0 h-1 bg-destructive" />
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete Session</DialogTitle>
            <DialogDescription>
              Permanently delete{" "}
              <span className="font-semibold text-foreground">
                {sessionToDelete?.customer_name}
              </span>{" "}
              and every snack ordered in it. This cannot be undone.
              {sessionToDelete?.status === "checked_out" &&
                " The sale is also removed from today's history and the summary reports."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setSessionToDelete(null)}
              className="w-full border-border/50 bg-background sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteSession}
              disabled={isDeletingSession}
              className="w-full shadow-md transition-all hover:opacity-90 hover:shadow-lg sm:w-auto"
            >
              {isDeletingSession ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-destructive-foreground border-t-transparent" />
                  Deleting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Session Dialog */}
      <Dialog open={isAddSessionOpen} onOpenChange={setIsAddSessionOpen}>
        <DialogContent className="mx-4 sm:mx-auto">
          <div className="absolute inset-x-0 top-0 h-1 gradient-primary" />
          <DialogHeader>
            <DialogTitle className="text-foreground">Add Session</DialogTitle>
            <DialogDescription>
              Create an active session manually with time in.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-session-name">Customer Name</Label>
              <Input
                id="new-session-name"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Enter customer name"
                className="h-12 border-border/50 bg-secondary/30"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="new-session-members">Number of Members</Label>
              <Input
                id="new-session-members"
                type="number"
                min="1"
                value={newSessionMembers}
                onChange={(e) => setNewSessionMembers(e.target.value)}
                className="h-12 border-border/50 bg-secondary/30"
              />
              {newMembersInvalid && (
                <p className="text-xs text-destructive">Must be at least 1 person</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="new-session-time-in">Time In</Label>
              <Input
                id="new-session-time-in"
                type="datetime-local"
                max={getNowLocalDateTimeValue()}
                value={newSessionTimeIn}
                onChange={(e) => setNewSessionTimeIn(e.target.value)}
                className="h-12 border-border/50 bg-secondary/30"
              />
              {newTimeInInFuture && (
                <p className="text-xs text-destructive">
                  Time in cannot be in the future — check the date too
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setIsAddSessionOpen(false)}
              className="w-full border-border/50 bg-background sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={createAdminSession}
              disabled={isCreatingSession}
              className="w-full gradient-primary text-primary-foreground shadow-md transition-all hover:opacity-90 hover:shadow-lg sm:w-auto"
            >
              {isCreatingSession ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Creating...
                </span>
              ) : (
                "Add Session"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Order Detail Dialog */}
      <Dialog
        open={!!historyDetailSession}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryDetailSession(null)
            setHistoryDetailSnackItems([])
            setHistoryDetailSnackTotal(0)
            setIsLoadingHistoryDetails(false)
          }
        }}
      >
        <DialogContent className="mx-4 max-w-md sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Order Details</DialogTitle>
            <DialogDescription>
              {historyDetailSession
                ? `Checkout details for ${historyDetailSession.customer_name}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {historyDetailSession && (
            (() => {
              const started = new Date(historyDetailSession.started_at)
              const ended = historyDetailSession.ended_at
                ? new Date(historyDetailSession.ended_at)
                : new Date(historyDetailSession.started_at)
              const durationMs = Math.max(0, ended.getTime() - started.getTime())
              const hours = Math.floor(durationMs / (1000 * 60 * 60))
              const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))
              const billableHours = getBillableHours(durationMs)
              const members = historyDetailSession.member_count || 1
              const perPersonFee =
                Number(historyDetailSession.base_fee) + Number(historyDetailSession.hourly_rate) * billableHours
              const sessionFeeTotal = perPersonFee * members

              return (
                <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-secondary/10 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Members</span>
                    <span className="font-medium text-foreground">{members}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-medium text-foreground">{hours}h {minutes}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price per person</span>
                    <span className="font-medium text-foreground">฿{perPersonFee.toFixed(2)}/person</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Session fee ({members} person{members > 1 ? "s" : ""})</span>
                    <span className="font-medium text-foreground">฿{sessionFeeTotal.toFixed(2)}</span>
                  </div>

                  <p className="mt-1 text-xs font-bold uppercase tracking-wider text-foreground">Snacks</p>
                  {isLoadingHistoryDetails ? (
                    <p className="text-xs text-muted-foreground">Loading snacks...</p>
                  ) : historyDetailSnackItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No snacks ordered</p>
                  ) : (
                    historyDetailSnackItems.map((item) => (
                      <div key={item.id} className="flex justify-between">
                        <span className="text-muted-foreground">
                          {item.name} × {item.quantity}
                        </span>
                        <span className="font-medium text-foreground">
                          ฿{(item.quantity * item.price_at_time).toFixed(2)}
                        </span>
                      </div>
                    ))
                  )}

                  <div className="flex justify-between border-t border-border/30 pt-2">
                    <span className="text-muted-foreground">Snack total</span>
                    <span className="font-medium text-foreground">฿{historyDetailSnackTotal.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/50 pt-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Charged</span>
                    <span className="timer-display text-xl font-bold text-primary">
                      ฿{Number(historyDetailSession.total_cost ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )
            })()
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EstimatedCost({ session, pricing }: { session: Session; pricing: PricingConfig }) {
  const [cost, setCost] = useState(0)

  useEffect(() => {
    const calculateCost = async () => {
      const now = new Date()
      const started = new Date(session.time_in || session.started_at)
      const diffMs = Math.max(0, now.getTime() - started.getTime())
      const billableHours = calculateBillableHours(diffMs, pricing.max_billable_hours)

      const { data: sessionSnacks } = await supabase
        .from("session_snacks")
        .select("quantity, price_at_time")
        .eq("session_id", session.id)

      const snackTotal = (sessionSnacks ?? []).reduce(
        (sum, s) => sum + s.quantity * s.price_at_time,
        0
      )

      setCost(
        calculateSessionTotal({
          baseFee: session.base_fee,
          hourlyRate: session.hourly_rate,
          billableHours,
          memberCount: session.member_count || 1,
          snackTotal,
        })
      )
    }

    void calculateCost()
    const interval = setInterval(() => {
      void calculateCost()
    }, ESTIMATE_REFRESH_MS)

    return () => clearInterval(interval)
  }, [session, pricing])

  return <span suppressHydrationWarning>฿{cost.toFixed(2)}</span>
}

/**
 * The time charge one member owes, snacks excluded — the running session fee
 * divided by the member count. Snacks are left out because they belong to
 * whoever ordered them, not to the table.
 */
function FeePerPerson({ session, pricing }: { session: Session; pricing: PricingConfig }) {
  const [fee, setFee] = useState(0)

  useEffect(() => {
    function update() {
      const started = new Date(session.time_in || session.started_at)
      const diffMs = Math.max(0, Date.now() - started.getTime())

      setFee(
        calculateFeePerPerson({
          baseFee: session.base_fee,
          hourlyRate: session.hourly_rate,
          billableHours: calculateBillableHours(diffMs, pricing.max_billable_hours),
        })
      )
    }

    update()
    const interval = setInterval(update, ESTIMATE_REFRESH_MS)
    return () => clearInterval(interval)
  }, [session, pricing])

  return <span suppressHydrationWarning>฿{fee.toFixed(2)}</span>
}
