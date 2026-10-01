import { useId } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

/** Controlled confirmation; the caller owns target freshness and write deduplication. */
export function ConfirmAction({ open, title, description, cancelLabel, confirmLabel, destructive = false, onCancel, onConfirm }: {
  open: boolean; title: string; description: string; cancelLabel: string; confirmLabel: string;
  destructive?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
    {open && <div className="fixed inset-0 z-50 bg-black/50" aria-hidden="true" onClick={onCancel} />}
    <DialogContent role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <p id={descriptionId} className="mt-3 break-words text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button data-cancel-action variant="outline" onClick={onCancel}>{cancelLabel}</Button>
        <Button data-confirm-action variant={destructive ? "destructive" : "default"} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
