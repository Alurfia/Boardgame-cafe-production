"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2, ShoppingBag, Minus } from "lucide-react"
import type { Snack, SessionSnack } from "@/lib/types"

const supabase = createClient()

interface SessionSnacksListProps {
  sessionId: string
  snacks: Snack[]
  onUpdate: () => void
}

export function SessionSnacksList({
  sessionId,
  snacks,
  onUpdate,
}: SessionSnacksListProps) {
  const [sessionSnacks, setSessionSnacks] = useState<
    (SessionSnack & { snack_name: string })[]
  >([])
  const [selectedSnackId, setSelectedSnackId] = useState<string>("")
  const [isAdding, setIsAdding] = useState(false)
  const [showNewSnackForm, setShowNewSnackForm] = useState(false)
  const [newSnackName, setNewSnackName] = useState("")
  const [newSnackPrice, setNewSnackPrice] = useState("")
  const [isCreatingSnack, setIsCreatingSnack] = useState(false)

  useEffect(() => {
    fetchSessionSnacks()
  }, [sessionId])

  async function fetchSessionSnacks() {
    const { data } = await supabase
      .from("session_snacks")
      .select("*, snacks(name)")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })

    const mapped = (data ?? []).map((item: Record<string, unknown>) => ({
      ...item,
      snack_name: (item.snacks as { name: string } | null)?.name ?? "Unknown",
    })) as (SessionSnack & { snack_name: string })[]

    setSessionSnacks(mapped)
  }

  async function addSnack() {
    if (!selectedSnackId) return
    setIsAdding(true)

    const snack = snacks.find((s) => s.id === selectedSnackId)
    if (!snack) return

    try {
      const existing = sessionSnacks.find(
        (ss) => ss.snack_id === selectedSnackId
      )
      if (existing) {
        const { error } = await supabase
          .from("session_snacks")
          .update({ quantity: existing.quantity + 1 })
          .eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("session_snacks").insert({
          session_id: sessionId,
          snack_id: snack.id,
          quantity: 1,
          price_at_time: snack.price,
        })
        if (error) throw error
      }

      toast.success(`Added ${snack.name}`)
      fetchSessionSnacks()
      onUpdate()
      setSelectedSnackId("")
    } catch {
      toast.error("Failed to add snack")
    } finally {
      setIsAdding(false)
    }
  }

  async function removeSnack(snackId: string) {
    try {
      const { error } = await supabase
        .from("session_snacks")
        .delete()
        .eq("id", snackId)

      if (error) throw error
      toast.success("Snack removed")
      fetchSessionSnacks()
      onUpdate()
    } catch {
      toast.error("Failed to remove snack")
    }
  }

  async function updateQuantity(ss: SessionSnack & { snack_name: string }, delta: number) {
    const newQty = ss.quantity + delta
    try {
      if (newQty <= 0) {
        const { error } = await supabase.from("session_snacks").delete().eq("id", ss.id)
        if (error) throw error
        toast.success("Snack removed")
      } else {
        const { error } = await supabase.from("session_snacks").update({ quantity: newQty }).eq("id", ss.id)
        if (error) throw error
      }
      fetchSessionSnacks()
      onUpdate()
    } catch {
      toast.error("Failed to update quantity")
    }
  }

  async function createNewSnack() {
    if (!newSnackName.trim() || !newSnackPrice.trim()) {
      toast.error("Please fill in snack name and price")
      return
    }

    setIsCreatingSnack(true)
    try {
      const price = parseFloat(newSnackPrice)
      if (isNaN(price) || price < 0) {
        toast.error("Invalid price")
        return
      }

      // Create new snack in database
      const { data: newSnack, error } = await supabase
        .from("snacks")
        .insert({
          name: newSnackName.trim(),
          price: price,
          available: true,
        })
        .select()
        .single()

      if (error) throw error

      toast.success(`Created new snack: ${newSnackName}`)

      // Add the snack to the current session
      const { error: addError } = await supabase.from("session_snacks").insert({
        session_id: sessionId,
        snack_id: newSnack.id,
        quantity: 1,
        price_at_time: price,
      })

      if (addError) throw addError

      setNewSnackName("")
      setNewSnackPrice("")
      setShowNewSnackForm(false)
      fetchSessionSnacks()
      onUpdate()
    } catch {
      toast.error("Failed to create snack")
    } finally {
      setIsCreatingSnack(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add snack or create new */}
      <div className="flex flex-col gap-3">
        {showNewSnackForm ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                placeholder="Snack name"
                value={newSnackName}
                onChange={(e) => setNewSnackName(e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                placeholder="Price"
                value={newSnackPrice}
                onChange={(e) => setNewSnackPrice(e.target.value)}
                step="0.01"
                min="0"
                className="w-20"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={createNewSnack}
                disabled={isCreatingSnack}
                className="flex-1 bg-green-600 text-white hover:bg-green-700"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create & Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNewSnackForm(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={selectedSnackId} onValueChange={setSelectedSnackId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a snack" />
                </SelectTrigger>
                <SelectContent>
                  {snacks.filter((s) => s.available).map((snack) => (
                    <SelectItem key={snack.id} value={snack.id}>
                      {snack.name} (฿{Number(snack.price).toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={addSnack}
                disabled={!selectedSnackId || isAdding}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNewSnackForm(true)}
              className="w-full"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create New Snack
            </Button>
          </>
        )}
      </div>

      {/* Snack list */}
      {sessionSnacks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">No snacks ordered yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sessionSnacks.map((ss) => (
            <div
              key={ss.id}
              className="flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-3 py-2.5"
            >
              <div>
                <p className="text-xs font-semibold text-foreground sm:text-sm">
                  {ss.snack_name}
                </p>
                <p className="text-[10px] text-muted-foreground sm:text-xs">
                  ฿{Number(ss.price_at_time).toFixed(2)}/ea = ฿
                  {(ss.quantity * Number(ss.price_at_time)).toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => updateQuantity(ss, -1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm font-semibold text-foreground">{ss.quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => updateQuantity(ss, 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => removeSnack(ss.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="sr-only">Remove snack</span>
                </Button>
              </div>
            </div>
          ))}
          
        </div>
      )}
    </div>
  )
}
