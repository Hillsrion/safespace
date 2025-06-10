"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog"
import { Button } from "~/components/ui/button"

interface LeaveSpaceDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

export function LeaveSpaceDialog({
  isOpen,
  onClose,
  onConfirm,
}: LeaveSpaceDialogProps) {
  if (!isOpen) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quitter l'espace</DialogTitle>
          <DialogDescription>
            Êtes-vous sûr de vouloir quitter cet espace ?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={() => {
            onConfirm()
            onClose() // Close dialog after confirm for now
          }}>
            Quitter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
