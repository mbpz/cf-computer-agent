import { useId } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

/**
 * Controlled confirmation; the caller owns target freshness and write deduplication.
 *
 * The surface is the app's single modal (`ui/dialog.tsx` over beUI's modal), shared
 * with `TypedConfirmAction`, so there is no second confirmation implementation.
 *
 * beUI's `hold-action-button`/`slide-action-button` were evaluated for the destructive
 * cases and declined: both complete on a gesture (hold to 1.6s, or drag past 82%),
 * while the operator contract is click-to-confirm — `[data-confirm-action]` is clicked
 * once and the write happens (test/unit/frontend-admin-member-confirmation.test.tsx:43,
 * test/unit/admin-menus-page.test.tsx:85, scripts/browser-vm-environments-page.test.mjs:480).
 * They also paint `bg-sky-400` and a 22px radius, outside this app's token set and
 * single `--radius`. The consequence text, the `role="alertdialog"` name/description
 * pair and the caller's receipt/uncertainty path all live on the modal, so the
 * destructive confirmations stay here.
 */
export function ConfirmAction({ open, title, description, cancelLabel, confirmLabel, destructive = false, onCancel, onConfirm }: {
  open: boolean; title: string; description: string; cancelLabel: string; confirmLabel: string;
  destructive?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
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
