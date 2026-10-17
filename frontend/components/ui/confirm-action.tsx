import { useId } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { HoldActionButton } from "../motion/hold-action-button";

/**
 * Controlled confirmation; the caller owns target freshness and write deduplication.
 *
 * The surface is the app's single modal (`ui/dialog.tsx` over beUI's
 * `center-morph-modal`), so there is no second confirmation implementation.
 *
 * The destructive decision itself is beUI's `hold-action-button` (slug:
 * hold-action-button). §17 patch 4 adds `onActivate`, which keeps the operator
 * contract that a single press on `[data-confirm-action]` performs the write
 * (`test/unit/frontend-admin-member-confirmation.test.tsx:43`,
 * `test/unit/admin-menus-page.test.tsx:85`,
 * `scripts/browser-vm-environments-page.test.mjs:480`); the hold fill remains
 * the payload's own affordance on top of it. Its English `holdingLabel`/
 * `completeLabel` defaults are replaced with empty strings here because the
 * button's accessible name is `confirmLabel` and every string in this shell is
 * localized — the fill, not a caption, reports progress. The consequence text,
 * the `role="alertdialog"` name/description pair, the focus scope and the
 * caller's receipt/uncertainty path all stay on the modal.
 */
export function ConfirmAction({ open, title, description, cancelLabel, confirmLabel, destructive = false, onCancel, onConfirm }: {
  open: boolean; title: string; description: string; cancelLabel: string; confirmLabel: string;
  destructive?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
    <DialogContent role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId} dismissLabel={cancelLabel} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <p id={descriptionId} className="mt-3 break-words text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <Button data-cancel-action variant="outline" onClick={onCancel}>{cancelLabel}</Button>
        {destructive
          ? <HoldActionButton
              type="horizontal"
              data-confirm-action
              aria-label={confirmLabel}
              holdingLabel=""
              completeLabel=""
              onActivate={onConfirm}
              onHoldComplete={onConfirm}
              className="h-11 min-h-11 min-w-0 rounded-lg px-4 text-sm font-medium"
            >{confirmLabel}</HoldActionButton>
          : <Button data-confirm-action variant="default" onClick={onConfirm}>{confirmLabel}</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
