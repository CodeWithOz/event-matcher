'use client';

import { useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  /** Whether the dialog is shown; set it to false (via onOpenChange) to close it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Label of the confirm button, e.g. "Delete". */
  confirmLabel: string;
  /** Label shown on the confirm button while the action runs, e.g. "Deleting…". */
  pendingLabel?: string;
  /**
   * The action to run. The dialog stays open while it runs and closes when it
   * resolves; if it throws, the error message is shown in the dialog.
   */
  onConfirm: () => Promise<void>;
}

/**
 * Confirmation modal for destructive admin actions (delete, ignore…), so they
 * all look and behave the same. Use it instead of window.confirm(), which some
 * embedded browsers block silently.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    // Escape / overlay / Cancel must not close the dialog while the action runs
    if (pending) return;
    if (!next) setError(null);
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          {/* A plain button (not AlertDialogAction) so the dialog stays open while the action runs */}
          <Button variant="destructive" onClick={handleConfirm} disabled={pending} aria-busy={pending}>
            {pending ? pendingLabel ?? confirmLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
