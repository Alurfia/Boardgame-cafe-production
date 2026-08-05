"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DollarSign } from "lucide-react"
import type { PricingConfig } from "@/lib/types"

const supabase = createClient()

interface PricingPanelProps {
  pricing: PricingConfig
  onUpdate: () => void
}

export function PricingPanel({ pricing, onUpdate }: PricingPanelProps) {
  const [baseFee, setBaseFee] = useState(String(pricing.base_fee))
  const [hourlyRate, setHourlyRate] = useState(String(pricing.hourly_rate))
  const [maxBillableHours, setMaxBillableHours] = useState(String(pricing.max_billable_hours || 5))
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from("pricing_config")
        .update({
          base_fee: parseFloat(baseFee),
          hourly_rate: parseFloat(hourlyRate),
          max_billable_hours: parseInt(maxBillableHours),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pricing.id)

      if (error) throw error
      toast.success("Pricing updated successfully")
      onUpdate()
    } catch {
      toast.error("Failed to update pricing")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader className="pb-3 sm:pb-6">
        <CardTitle className="flex items-center gap-2 text-base text-foreground sm:text-lg">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 sm:h-8 sm:w-8">
            <DollarSign className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
          </div>
          Pricing Configuration
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          กำนวดราคาค่าบริการของร้าน เช่น ค่าแรกเข้าและราคาต่อชั่วโมง 
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="base-fee" className="text-sm">ค่าแรกเข้า (฿)</Label>
              <Input
                id="base-fee"
                type="number"
                step="0.50"
                min="0"
                value={baseFee}
                onChange={(e) => setBaseFee(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hourly-rate" className="text-sm">ราคาต่อชั่วโมง (฿)</Label>
              <Input
                id="hourly-rate"
                type="number"
                step="0.50"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="max-hours" className="text-sm">Max Hours to Charge</Label>
              <Input
                id="max-hours"
                type="number"
                min="1"
                step="1"
                value={maxBillableHours}
                onChange={(e) => setMaxBillableHours(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl bg-primary/10 p-4 text-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              สูตรคำนวณราคา
            </p>
            <p className="mt-1.5 font-mono text-sm text-foreground">
              ราคารวม = ฿{baseFee || "0"} + (฿{hourlyRate || "0"} x ชั่วโมง) + ของกินเพิ่มเติม
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              * คิดค่าชั่วโมงสูงสุด {maxBillableHours || "5"} ชั่วโมง (สูงสุด ฿{(parseFloat(hourlyRate) || 0) * (parseInt(maxBillableHours) || 5)})
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-fit"
          >
            {isSaving ? "Saving..." : "Save Pricing"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
