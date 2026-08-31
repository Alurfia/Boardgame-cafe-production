"use client"

import { Minus, Plus, TicketPercent } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

interface DiscountHoursFieldProps {
  /** Privileges currently redeemed. Whole hours only. */
  value: number
  onChange: (next: number) => void
  /** `floor(hours played x members)` — see `calculateMaxDiscountHours`. */
  max: number
  /** Whole hours each person can redeem — see `calculatePrivilegeHours`. */
  countedHours: number
  memberCount: number
  /** What those privileges are worth, from `calculateDiscountAmount`. */
  discountAmount: number
  /** What one privilege is worth here, from `calculateDiscountRate`. */
  discountRate: number
  id?: string
}

/**
 * The `+ / -` stepper for redeemed discount privileges, shared by every screen
 * that settles a bill — checkout, partial checkout, the add-finished-session
 * form and the history edit dialog — so the cap and the wording cannot drift
 * between them.
 */
export function DiscountHoursField({
  value,
  onChange,
  max,
  countedHours,
  memberCount,
  discountAmount,
  discountRate,
  id = "discount-hours",
}: DiscountHoursFieldProps) {
  const clamped = Math.min(Math.max(0, Math.floor(value)), max)

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
        <TicketPercent className="h-3.5 w-3.5 text-primary" />
        สิทธิ์ส่วนลด (1 สิทธิ์ = 1 ชม.)
      </Label>
      <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold text-foreground sm:text-sm">
            ใช้ {clamped} สิทธิ์
          </p>
          <p className="text-[10px] text-muted-foreground sm:text-xs">
            สูงสุด {max} สิทธิ์ (นับ {countedHours} ชม. × {memberCount} คน)
            {max > 0 ? ` · สิทธิ์ละ ฿${discountRate.toFixed(2)}` : ""}
            {discountAmount > 0 ? ` · −฿${discountAmount.toFixed(2)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={clamped <= 0}
            onClick={() => onChange(Math.max(0, clamped - 1))}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span id={id} className="w-6 text-center text-sm font-semibold text-foreground">
            {clamped}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={clamped >= max}
            onClick={() => onChange(Math.min(max, clamped + 1))}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {max === 0 && (
        <p className="text-[10px] text-muted-foreground">
          ยังเล่นไม่ครบ 1 ชม. จึงใช้สิทธิ์ไม่ได้
        </p>
      )}
    </div>
  )
}
