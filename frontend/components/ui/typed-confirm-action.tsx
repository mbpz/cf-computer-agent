import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { Input } from "./input";

/**
 * Confirmation for an irreversible administrator action that requires the
 * operator to type an exact value (the number of objects, the maintenance
 * window). The confirm button only enables when the typed text matches, so a
 * click cannot accidentally confirm.
 */
export function TypedConfirmAction({ open, title, description, expectLabel, expectValue, inputLabel, cancelLabel, confirmLabel, destructive = false, pending = false, onCancel, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  expectLabel: string;
  /** The exact text the operator must type before the action can be confirmed. */
  expectValue: string;
  inputLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const openRef = useRef(open);
  useEffect(() => {
    if (openRef.current !== open) {
      openRef.current = open;
      if (open) setTyped("");
    }
  }, [open]);
  const matches = expectValue.length > 0 && typed === expectValue;
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
    <DialogContent role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <p id={descriptionId} className="mt-3 break-words text-sm text-muted-foreground">{description}</p>
      <label className="mt-4 block text-sm font-medium" htmlFor={inputId}>{inputLabel}</label>
      <p className="mt-1 break-words text-sm text-muted-foreground">{expectLabel}</p>
      {/* The shared field primitive, so the typed confirmation cannot drift into a
          second input surface: same beUI field language as every other text field. */}
      <Input id={inputId} data-typed-confirm-input value={typed} disabled={pending} autoComplete="off" spellCheck={false}
        onChange={(event) => setTyped(event.target.value)} className="mt-2" />
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button data-cancel-action variant="outline" disabled={pending} onClick={onCancel}>{cancelLabel}</Button>
        <Button data-confirm-action variant={destructive ? "destructive" : "default"} disabled={!matches || pending} onClick={() => { if (matches && !pending) onConfirm(); }}>
          {confirmLabel}
        </Button>
      </div>
    </DialogContent>
  </Dialog>;
}
