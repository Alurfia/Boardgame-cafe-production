"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Cookie, Pencil, Plus, Trash2 } from "lucide-react"
import type { Snack } from "@/lib/types"

const supabase = createClient()

interface SnacksPanelProps {
  snacks: Snack[]
  onUpdate: () => void
}

export function SnacksPanel({ snacks, onUpdate }: SnacksPanelProps) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editSnack, setEditSnack] = useState<Snack | null>(null)
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  function openAdd() {
    setName("")
    setPrice("")
    setIsAddOpen(true)
  }

  function openEdit(snack: Snack) {
    setName(snack.name)
    setPrice(String(snack.price))
    setEditSnack(snack)
  }

  async function handleSave() {
    if (!name.trim() || !price.trim()) {
      toast.error("Please fill in all fields")
      return
    }
    setIsSaving(true)

    try {
      if (editSnack) {
        const { error } = await supabase
          .from("snacks")
          .update({ name: name.trim(), price: parseFloat(price) })
          .eq("id", editSnack.id)
        if (error) throw error
        toast.success("Snack updated")
        setEditSnack(null)
      } else {
        const { error } = await supabase
          .from("snacks")
          .insert({ name: name.trim(), price: parseFloat(price) })
        if (error) throw error
        toast.success("Snack added")
        setIsAddOpen(false)
      }
      onUpdate()
    } catch {
      toast.error("Failed to save snack")
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleAvailability(snack: Snack) {
    try {
      const { error } = await supabase
        .from("snacks")
        .update({ available: !snack.available })
        .eq("id", snack.id)
      if (error) throw error
      onUpdate()
    } catch {
      toast.error("Failed to update availability")
    }
  }

  async function deleteSnack(snack: Snack) {
    try {
      const { error } = await supabase
        .from("snacks")
        .delete()
        .eq("id", snack.id)
      if (error) throw error
      toast.success(`${snack.name} deleted`)
      onUpdate()
    } catch {
      toast.error("Failed to delete snack")
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between sm:pb-6">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-foreground sm:text-lg">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 sm:h-8 sm:w-8">
              <Cookie className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
            </div>
            Snack Menu
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {snacks.length} รายการในเมนู
          </CardDescription>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={openAdd}
              size="sm"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Snack
            </Button>
          </DialogTrigger>
          <DialogContent className="mx-4 sm:mx-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">เพิ่มของกินใหม่</DialogTitle>
              <DialogDescription>เพิ่มรายการของกินในเมนูของคุณ</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="snack-name">Name</Label>
                <Input
                  id="snack-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Brownie"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="snack-price">Price (฿)</Label>
                <Input
                  id="snack-price"
                  type="number"
                  step="1.00"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="10"
                />
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setIsAddOpen(false)} className="w-full bg-transparent sm:w-auto">
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
              >
                {isSaving ? "Saving..." : "Add Snack"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {snacks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Cookie className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">ยังไม่มีของกิน</p>
            <p className="text-xs text-muted-foreground">เพิ่มรายการของกินให้ลูกค้าสั่งได้</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {snacks.map((snack) => (
              <div
                key={snack.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/30"
              >
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-0.5">
                    <p className="font-semibold text-foreground">{snack.name}</p>
                    <p className="font-mono text-lg font-bold text-primary">
                      ฿{Number(snack.price).toFixed(2)}
                    </p>
                  </div>
                  <Badge
                    variant={snack.available ? "default" : "secondary"}
                    className={snack.available ? "bg-accent text-accent-foreground" : ""}
                  >
                    {snack.available ? "In Stock" : "Out"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={snack.available}
                      onCheckedChange={() => toggleAvailability(snack)}
                      aria-label={`Toggle availability for ${snack.name}`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {snack.available ? "Available" : "Unavailable"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(snack)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">Edit {snack.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteSnack(snack)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sr-only">Delete {snack.name}</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog
        open={!!editSnack}
        onOpenChange={(open) => !open && setEditSnack(null)}
      >
        <DialogContent className="mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">แก้ไขของกิน</DialogTitle>
            <DialogDescription>แก้ไขรายละเอียดของกิน</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-price">Price ($)</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setEditSnack(null)} className="w-full bg-transparent sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
