"use client"

import { useCallback, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertCircle } from "lucide-react"

interface KioskError {
  title: string
  description?: string
}

/**
 * Kiosk errors go through a modal rather than a toast: customers glance at the
 * screen between turns and were missing the toast entirely, so a failed check-in
 * looked like nothing had happened. Successes stay on `sonner` — they do not
 * need an acknowledgement, and a dialog per snack tap would be unusable.
 *
 * Returns the dialog element to render plus the function that opens it.
 */
export function useKioskError() {
  const [error, setError] = useState<KioskError | null>(null)

  const showError = useCallback((title: string, description?: string) => {
    setError({ title, description })
  }, [])

  const errorDialog = (
    <AlertDialog open={error !== null} onOpenChange={(open) => { if (!open) setError(null) }}>
      <AlertDialogContent className="mx-4 max-w-sm border-destructive/30 sm:mx-auto">
        <AlertDialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <AlertDialogTitle className="text-center text-base text-foreground sm:text-lg">
            {error?.title}
          </AlertDialogTitle>
          {error?.description && (
            <AlertDialogDescription className="text-center text-sm">
              {error.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction className="h-12 w-full text-base font-semibold sm:h-11 sm:text-sm">
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { showError, errorDialog }
}
