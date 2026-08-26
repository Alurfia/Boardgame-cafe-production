"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  calculateBillableHours,
  calculateElapsedMs,
  calculatePausedMs,
  calculatePrivilegeHours,
  calculateDiscountAmount,
  calculateDiscountRate,
  calculateMaxDiscountHours,
  calculateSessionTotal,
  roundCurrency,
} from "@/lib/billing"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CalendarDays, ChevronLeft, ChevronRight, History, Pause, Pencil, Trash2 } from "lucide-react"
import { SessionSnacksList } from "./session-snacks-list"
import { DiscountHoursField } from "./discount-hours-field"
import type { PricingConfig, Session, Snack } from "@/lib/types"

const supabase = createClient()

const DAY_MS = 24 * 60 * 60 * 1000

interface HistoryPanelProps {
  /** Every checked-out session; this panel filters by the selected day. */
  sessions: Session[]
  /** The snack menu, for adding items to a past session. */
  snacks: Snack[]
  pricing: PricingConfig
  onUpdate: () => void
}

/** `YYYY-MM-DD` in local time, the format a `date` input expects. */
function toDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DDTHH:mm` in local time, for a `datetime-local` input. */
function toDateTimeValue(date: Date): string {
  const safe = Number.isNaN(date.getTime()) ? new Date() : date
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${toDateValue(safe)}T${pad(safe.getHours())}:${pad(safe.getMinutes())}`
}

function getTimeIn(session: Session): Date {
  return new Date(session.time_in || session.started_at)
}

function getTimeOut(session: Session): Date | null {
  const raw = session.time_out || session.ended_at
  return raw ? new Date(raw) : null
}

function formatClock(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "—"
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

export function HistoryPanel({ sessions, snacks, pricing, onUpdate }: HistoryPanelProps) {
  const [selectedDate, setSelectedDate] = useState(() => toDateValue(new Date()))
  const [snackTotals, setSnackTotals] = useState<Record<string, number>>({})

  const [editSession, setEditSession] = useState<Session | null>(null)
  const [editName, setEditName] = useState("")
  const [editMembers, setEditMembers] = useState("1")
  const [editTimeIn, setEditTimeIn] = useState("")
  const [editTimeOut, setEditTimeOut] = useState("")
  /** `sessions.paused_ms` as whole minutes — the unit staff actually think in. */
  const [editPausedMinutes, setEditPausedMinutes] = useState("0")
  const [editDiscountHours, setEditDiscountHours] = useState(0)
  const [editSnackTotal, setEditSnackTotal] = useState(0)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const todayValue = toDateValue(new Date())

  // Sessions are grouped by the day they checked out, so this table always
  // agrees with the revenue figures in the summary tab.
  const rows = useMemo(() => {
    return sessions
      .filter((session) => {
        const out = getTimeOut(session)
        return out !== null && !Number.isNaN(out.getTime()) && toDateValue(out) === selectedDate
      })
      .sort((a, b) => {
        const left = getTimeOut(a)?.getTime() ?? 0
        const right = getTimeOut(b)?.getTime() ?? 0
        return right - left
      })
  }, [sessions, selectedDate])

  const dayRevenue = rows.reduce((sum, session) => sum + Number(session.total_cost ?? 0), 0)
  const dayMembers = rows.reduce((sum, session) => sum + (session.member_count || 1), 0)

  const sessionIdsKey = useMemo(() => sessions.map((s) => s.id).join(","), [sessions])

  const loadSnackTotals = useCallback(async () => {
    const { data } = await supabase
      .from("session_snacks")
      .select("session_id, quantity, price_at_time")

    const totals: Record<string, number> = {}
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const sessionId = String(row.session_id)
      totals[sessionId] =
        (totals[sessionId] ?? 0) + Number(row.quantity) * Number(row.price_at_time)
    }
    setSnackTotals(totals)
  }, [])

  useEffect(() => {
    void loadSnackTotals()
  }, [loadSnackTotals, sessionIdsKey])

  function shiftDay(days: number) {
    const current = new Date(`${selectedDate}T00:00:00`)
    if (Number.isNaN(current.getTime())) return
    setSelectedDate(toDateValue(new Date(current.getTime() + days * DAY_MS)))
  }

  /** Reads a single session's snack total straight from the database. */
  const readSnackTotal = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from("session_snacks")
      .select("quantity, price_at_time")
      .eq("session_id", sessionId)

    const total = ((data ?? []) as Array<Record<string, unknown>>).reduce(
      (sum, row) => sum + Number(row.quantity) * Number(row.price_at_time),
      0,
    )
    const rounded = roundCurrency(total)
    setEditSnackTotal(rounded)
    return rounded
  }, [])

  async function openEdit(session: Session) {
    setEditSession(session)
    setEditName(session.customer_name)
    setEditMembers(String(session.member_count || 1))
    setEditTimeIn(toDateTimeValue(getTimeIn(session)))
    setEditTimeOut(toDateTimeValue(getTimeOut(session) ?? new Date()))
    setEditPausedMinutes(String(Math.round(Number(session.paused_ms ?? 0) / 60000)))
    setEditDiscountHours(session.discount_hours ?? 0)
    setEditSnackTotal(snackTotals[session.id] ?? 0)

    // Re-read so the recalculated total is exact even if the cached map is stale.
    await readSnackTotal(session.id)
  }

  /**
   * Snack edits write to the database immediately, so the frozen `total_cost`
   * is re-synced here — otherwise cancelling the dialog would leave the stored
   * total disagreeing with the snacks actually on the session. It is computed
   * from the session's *saved* time, member count and privileges; unsaved form
   * edits apply when Save Changes runs.
   */
  async function handleSnackChange() {
    if (!editSession) return

    const snackTotal = await readSnackTotal(editSession.id)

    const savedOut = getTimeOut(editSession)
    const savedElapsedMs = savedOut ? calculateElapsedMs(editSession, savedOut.getTime()) : 0

    const { error } = await supabase
      .from("sessions")
      .update({
        total_cost: calculateSessionTotal({
          baseFee: editSession.base_fee,
          hourlyRate: editSession.hourly_rate,
          billableHours: calculateBillableHours(savedElapsedMs, pricing.max_billable_hours),
          elapsedMs: savedElapsedMs,
          maxBillableHours: pricing.max_billable_hours,
          memberCount: editSession.member_count || 1,
          discountHours: editSession.discount_hours ?? 0,
          snackTotal,
        }),
      })
      .eq("id", editSession.id)

    if (error) {
      toast.error("Failed to update total")
      return
    }

    onUpdate()
    void loadSnackTotals()
  }

  const parsedEditMembers = parseInt(editMembers, 10)
  const editMembersInvalid = !Number.isFinite(parsedEditMembers) || parsedEditMembers < 1
  const editMembersForCalc = editMembersInvalid ? 1 : parsedEditMembers

  const editTimeInDate = new Date(editTimeIn)
  const editTimeOutDate = new Date(editTimeOut)
  const editTimesValid =
    !Number.isNaN(editTimeInDate.getTime()) &&
    !Number.isNaN(editTimeOutDate.getTime()) &&
    editTimeOutDate.getTime() >= editTimeInDate.getTime()
  const editTimeOutInFuture =
    !Number.isNaN(editTimeOutDate.getTime()) && editTimeOutDate.getTime() > Date.now()

  // Paused time is stored on the row rather than folded into the timestamps, so
  // it has to come back off here — otherwise a corrected bill would silently
  // re-charge the hours staff stopped the clock for.
  const parsedEditPausedMinutes = parseInt(editPausedMinutes, 10)
  const editPausedMinutesInvalid =
    !Number.isFinite(parsedEditPausedMinutes) || parsedEditPausedMinutes < 0
  const editPausedMs = editPausedMinutesInvalid ? 0 : parsedEditPausedMinutes * 60 * 1000
  const editWallClockMs = editTimesValid
    ? Math.max(0, editTimeOutDate.getTime() - editTimeInDate.getTime())
    : 0
  const editPausedOverruns = editTimesValid && editPausedMs > editWallClockMs
  const editElapsedMs = editTimesValid ? Math.max(0, editWallClockMs - editPausedMs) : 0
  const editBillableHours = calculateBillableHours(editElapsedMs, pricing.max_billable_hours)
  const editPerPersonFee = editSession
    ? Number(editSession.base_fee) + Number(editSession.hourly_rate) * editBillableHours
    : 0
  const editMaxDiscountHours = calculateMaxDiscountHours(
    editElapsedMs,
    editMembersForCalc,
    pricing.max_billable_hours,
  )
  // Shortening the session or dropping a member can put the saved privileges
  // over the new cap, so the form works from the clamped number throughout.
  const editDiscountForCalc = Math.min(editDiscountHours, editMaxDiscountHours)
  const editDiscountRate = editSession
    ? calculateDiscountRate({
        baseFee: editSession.base_fee,
        hourlyRate: editSession.hourly_rate,
        billableHours: editBillableHours,
      })
    : 0
  const editDiscountAmount = editSession
    ? calculateDiscountAmount({
        baseFee: editSession.base_fee,
        hourlyRate: editSession.hourly_rate,
        billableHours: editBillableHours,
        elapsedMs: editElapsedMs,
        maxBillableHours: pricing.max_billable_hours,
        memberCount: editMembersForCalc,
        discountHours: editDiscountForCalc,
      })
    : 0
  const editTotal = editSession
    ? calculateSessionTotal({
        baseFee: editSession.base_fee,
        hourlyRate: editSession.hourly_rate,
        billableHours: editBillableHours,
        elapsedMs: editElapsedMs,
        maxBillableHours: pricing.max_billable_hours,
        memberCount: editMembersForCalc,
        discountHours: editDiscountForCalc,
        snackTotal: editSnackTotal,
      })
    : 0

  const editInvalid =
    !editName.trim() ||
    editMembersInvalid ||
    !editTimesValid ||
    editTimeOutInFuture ||
    editPausedMinutesInvalid ||
    editPausedOverruns

  async function saveEdit() {
    if (!editSession) return

    if (!editName.trim()) {
      toast.error("Please enter customer name")
      return
    }
    if (editMembersInvalid) {
      toast.error("Must be at least 1 person")
      return
    }
    if (!editTimesValid) {
      toast.error("Time out must be after or equal to time in")
      return
    }
    if (editTimeOutInFuture) {
      toast.error("Time out cannot be in the future", {
        description: "Check the date as well as the time.",
      })
      return
    }
    if (editPausedMinutesInvalid) {
      toast.error("เวลาที่หยุดต้องเป็นจำนวนนาทีที่ไม่ติดลบ")
      return
    }
    if (editPausedOverruns) {
      toast.error("เวลาที่หยุดยาวกว่าช่วงเข้า–ออก")
      return
    }

    const timeInIso = editTimeInDate.toISOString()
    const timeOutIso = editTimeOutDate.toISOString()

    setIsSavingEdit(true)
    try {
      const { error } = await supabase
        .from("sessions")
        .update({
          customer_name: editName.trim(),
          member_count: editMembersForCalc,
          started_at: timeInIso,
          time_in: timeInIso,
          ended_at: timeOutIso,
          time_out: timeOutIso,
          used_hours: Math.floor(editElapsedMs / (60 * 60 * 1000)),
          used_minutes: Math.floor((editElapsedMs % (60 * 60 * 1000)) / (60 * 1000)),
          discount_hours: editDiscountForCalc,
          paused_ms: editPausedMs,
          // A row reached from history is closed, so no pause span is open.
          paused_at: null,
          total_cost: editTotal,
          // The flag marks a bill no person has confirmed. Saving here is that
          // confirmation, so the row stops asking for a second look.
          auto_checked_out: false,
        })
        .eq("id", editSession.id)

      if (error) throw error
      toast.success("Session updated")
      setEditSession(null)
      onUpdate()
      void loadSnackTotals()
    } catch {
      toast.error("Failed to update session")
    } finally {
      setIsSavingEdit(false)
    }
  }

  async function confirmDelete() {
    if (!sessionToDelete) return

    setIsDeleting(true)
    try {
      const { error } = await supabase.from("sessions").delete().eq("id", sessionToDelete.id)
      if (error) throw error

      if (editSession?.id === sessionToDelete.id) setEditSession(null)
      toast.success(`${sessionToDelete.customer_name} deleted`)
      onUpdate()
      void loadSnackTotals()
    } catch {
      toast.error("Failed to delete session")
    } finally {
      setIsDeleting(false)
      setSessionToDelete(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden border-border/50 shadow-lg">
        <div className="h-1 w-full gradient-primary" />
        <CardHeader className="pb-3 sm:pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2 text-base text-foreground sm:text-lg">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-sm sm:h-9 sm:w-9">
                  <History className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                </div>
                ประวัติการใช้งาน
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                เลือกวันที่เพื่อดูย้อนหลัง — จัดกลุ่มตามวันที่เช็คเอาท์
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => shiftDay(-1)}
                className="h-10 w-10 shrink-0 border-border/50 bg-background"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous day</span>
              </Button>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  max={todayValue}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-10 w-[170px] border-border/50 bg-secondary/30 pl-9"
                  aria-label="History date"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => shiftDay(1)}
                disabled={selectedDate >= todayValue}
                className="h-10 w-10 shrink-0 border-border/50 bg-background"
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next day</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedDate(todayValue)}
                disabled={selectedDate === todayValue}
                className="h-10 border-border/50 bg-background text-xs"
              >
                วันนี้
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                <History className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                ไม่มีรายการในวันที่เลือก
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                ลองเลือกวันอื่น หรือกดปุ่มย้อนวัน
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/50 bg-secondary/20 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Sessions
                  </p>
                  <p className="text-lg font-bold text-foreground">{rows.length}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-secondary/20 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Members
                  </p>
                  <p className="text-lg font-bold text-foreground">{dayMembers}</p>
                </div>
                <div className="col-span-2 rounded-xl border border-primary/30 bg-primary/10 p-3 sm:col-span-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Revenue
                  </p>
                  <p className="timer-display text-lg font-bold text-primary">
                    ฿{dayRevenue.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/50">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="whitespace-nowrap">ลูกค้า</TableHead>
                      <TableHead className="whitespace-nowrap">เวลาเข้า</TableHead>
                      <TableHead className="whitespace-nowrap">เวลาออก</TableHead>
                      <TableHead className="whitespace-nowrap">ระยะเวลา</TableHead>
                      <TableHead className="whitespace-nowrap text-center">คน</TableHead>
                      <TableHead className="whitespace-nowrap text-right">ขนม</TableHead>
                      <TableHead className="whitespace-nowrap text-right">ยอดรวม</TableHead>
                      <TableHead className="w-[90px] text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((session) => {
                      const timeIn = getTimeIn(session)
                      const timeOut = getTimeOut(session)
                      // Counted time, not wall clock — a paused session sat at
                      // the table longer than it was billed for, and this
                      // column has to agree with ยอดรวม beside it.
                      const durationMs = timeOut ? calculateElapsedMs(session, timeOut.getTime()) : 0
                      const pausedMs = timeOut ? calculatePausedMs(session, timeOut.getTime()) : 0

                      return (
                        <TableRow key={session.id}>
                          <TableCell className="font-medium text-foreground">
                            <span className="flex items-center gap-1.5">
                              {session.customer_name}
                              {session.auto_checked_out && (
                                <Badge
                                  variant="outline"
                                  className="border-destructive/40 bg-destructive/10 px-1.5 py-0 text-[10px] font-medium text-destructive"
                                  title="ระบบเช็คเอาท์ให้อัตโนมัติ — ยอดนี้ยังไม่มีคนยืนยัน"
                                >
                                  Auto
                                </Badge>
                              )}
                              {session.parent_session_id && (
                                <Badge
                                  variant="outline"
                                  className="border-primary/40 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary"
                                  title="แยกออกมาจาก session อื่น — เก็บเงินเฉพาะคนที่ออกก่อน"
                                >
                                  Partial
                                </Badge>
                              )}
                              {pausedMs > 0 && (
                                <Badge
                                  variant="outline"
                                  className="gap-0.5 border-border bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                                  title="หยุดเวลาไประหว่างเล่น — ระยะเวลาที่แสดงหักออกแล้ว"
                                >
                                  <Pause className="h-2.5 w-2.5" />
                                  {Math.round(pausedMs / 60000)}m
                                </Badge>
                              )}
                              {(session.discount_hours ?? 0) > 0 && (
                                <Badge
                                  variant="outline"
                                  className="border-accent/40 bg-accent/10 px-1.5 py-0 text-[10px] font-medium text-accent"
                                  title="ใช้สิทธิ์ส่วนลด — 1 สิทธิ์ = 1 ชม."
                                >
                                  −{session.discount_hours} ชม.
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">
                            {formatClock(timeIn)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">
                            {formatClock(timeOut)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDuration(durationMs)}
                          </TableCell>
                          <TableCell className="text-center">
                            {session.member_count || 1}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                            ฿{(snackTotals[session.id] ?? 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="timer-display whitespace-nowrap text-right font-bold text-primary">
                            ฿{Number(session.total_cost ?? 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => void openEdit(session)}
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="sr-only">Edit session</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSessionToDelete(session)}
                                className="h-8 w-8 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="sr-only">Delete session</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Session Dialog */}
      <Dialog open={!!editSession} onOpenChange={(open) => !open && setEditSession(null)}>
        <DialogContent className="mx-4 max-h-[85vh] overflow-y-auto sm:mx-auto">
          <div className="absolute inset-x-0 top-0 h-1 gradient-accent" />
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Session</DialogTitle>
            <DialogDescription>
              The total is recalculated from these values using the rates saved on this session.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-history-name">Customer Name</Label>
              <Input
                id="edit-history-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-12 border-border/50 bg-secondary/30"
              />
              {!editName.trim() && (
                <p className="text-xs text-destructive">Please enter customer name</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-history-time-in">Time In</Label>
                <Input
                  id="edit-history-time-in"
                  type="datetime-local"
                  value={editTimeIn}
                  onChange={(e) => setEditTimeIn(e.target.value)}
                  className="h-12 border-border/50 bg-secondary/30"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-history-time-out">Time Out</Label>
                <Input
                  id="edit-history-time-out"
                  type="datetime-local"
                  value={editTimeOut}
                  onChange={(e) => setEditTimeOut(e.target.value)}
                  className="h-12 border-border/50 bg-secondary/30"
                />
              </div>
            </div>
            {!editTimesValid && (
              <p className="text-xs text-destructive">
                Time out must be after or equal to time in
              </p>
            )}
            {editTimeOutInFuture && (
              <p className="text-xs text-destructive">
                Time out cannot be in the future — check the date too
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-history-paused">เวลาที่หยุด (นาที)</Label>
              <Input
                id="edit-history-paused"
                type="number"
                min="0"
                value={editPausedMinutes}
                onChange={(e) => setEditPausedMinutes(e.target.value)}
                className="h-12 border-border/50 bg-secondary/30"
              />
              {editPausedMinutesInvalid ? (
                <p className="text-xs text-destructive">ต้องเป็นจำนวนนาทีที่ไม่ติดลบ</p>
              ) : editPausedOverruns ? (
                <p className="text-xs text-destructive">
                  หยุดนานกว่าช่วงเข้า–ออก — ตรวจเวลาอีกครั้ง
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  ช่วงที่กด Pause ไว้ หักออกจากเวลาที่คิดเงิน — เวลาเข้า–ออกยังเป็นเวลาจริง
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-history-members">Number of Members</Label>
              <Input
                id="edit-history-members"
                type="number"
                min="1"
                value={editMembers}
                onChange={(e) => setEditMembers(e.target.value)}
                className="h-12 border-border/50 bg-secondary/30"
              />
              {editMembersInvalid && (
                <p className="text-xs text-destructive">Must be at least 1 person</p>
              )}
            </div>

            <DiscountHoursField
              id="edit-history-discount-hours"
              value={editDiscountForCalc}
              onChange={setEditDiscountHours}
              max={editMaxDiscountHours}
              countedHours={calculatePrivilegeHours(editElapsedMs, pricing.max_billable_hours)}
              memberCount={editMembersForCalc}
              discountAmount={editDiscountAmount}
              discountRate={editDiscountRate}
            />

            {editSession && (
              <div className="flex flex-col gap-2">
                <Label>Snacks</Label>
                <p className="text-[11px] text-muted-foreground">
                  Snack changes save immediately and update the total on their own.
                </p>
                <div className="rounded-lg border border-border/50 bg-secondary/20 p-3">
                  <SessionSnacksList
                    sessionId={editSession.id}
                    snacks={snacks}
                    onUpdate={() => void handleSnackChange()}
                  />
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 text-sm">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">
                Recalculated Price
              </p>
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">
                  Usage time: {formatDuration(editElapsedMs)} → billed{" "}
                  {editBillableHours.toFixed(2)}h
                  {editPausedMs > 0
                    ? ` (หักเวลาที่หยุด ${formatDuration(editPausedMs)} จาก ${formatDuration(editWallClockMs)})`
                    : ""}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Price per person</span>
                  <span className="font-medium text-foreground">
                    ฿{editPerPersonFee.toFixed(2)}/person
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Session fee ({editMembersForCalc} person{editMembersForCalc > 1 ? "s" : ""})
                  </span>
                  <span className="font-medium text-foreground">
                    ฿{(editPerPersonFee * editMembersForCalc).toFixed(2)}
                  </span>
                </div>
                {editDiscountAmount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      ส่วนลดสิทธิ์ ({editDiscountForCalc} ชม.)
                    </span>
                    <span className="font-medium text-accent">
                      −฿{editDiscountAmount.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Snacks</span>
                  <span className="font-medium text-foreground">
                    ฿{editSnackTotal.toFixed(2)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-border/40 pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total
                  </span>
                  <span className="timer-display text-xl font-bold text-primary">
                    ฿{editTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setEditSession(null)}
              className="w-full border-border/50 bg-background sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={isSavingEdit || editInvalid}
              className="w-full gradient-accent text-accent-foreground shadow-md transition-all hover:opacity-90 hover:shadow-lg sm:w-auto"
            >
              {isSavingEdit ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground border-t-transparent" />
                  Saving...
                </span>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
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
              and every snack ordered in it. The sale is also removed from the summary reports.
              This cannot be undone.
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
              onClick={confirmDelete}
              disabled={isDeleting}
              className="w-full shadow-md transition-all hover:opacity-90 hover:shadow-lg sm:w-auto"
            >
              {isDeleting ? (
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
    </div>
  )
}
