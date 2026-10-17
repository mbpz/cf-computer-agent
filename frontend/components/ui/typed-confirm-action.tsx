import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { Input } from "./input";
import { SlideActionButton } from "../motion/slide-action-button";

/**
 * Confirmation for an irreversible administrator action that requires the
 * operator to type an exact value (the number of objects, the maintenance
 * window). The confirm control only enables when the typed text matches, so a
 * click cannot accidentally confirm.
 *
 * The control is beUI's `slide-action-button` (slug: slide-action-button).
 * §17 patches: `ariaLabel` names the thumb with the caller's localized confirm
 * label; `thumbProps` puts `data-confirm-action` on that thumb, which is the
 * node the suite clicks and whose `disabled` state it asserts
 * (`test/unit/frontend-admin-asset-hygiene.test.tsx:186`); `onActivate` keeps
 * the single-press contract (a keyboard/pointer activation completes without a
 * drag even before the track is measured) while leaving the typed gate in
 * charge. The typed input, its `data-typed-confirm-input` hook, the `matches`
 * gate and the `pending` disable remain exactly as before.
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
  const blocked = !matches || pending;
  const confirm = () => { if (!blocked) onConfirm(); };
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
    <DialogContent role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId} dismissLabel={cancelLabel} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <p id={descriptionId} className="mt-3 break-words text-sm text-muted-foreground">{description}</p>
      <label className="mt-4 block text-sm font-medium" htmlFor={inputId}>{inputLabel}</label>
      <p className="mt-1 break-words text-sm text-muted-foreground">{expectLabel}</p>
      {/* The shared field primitive, so the typed confirmation cannot drift into a
          second input surface: same beUI field language as every other text field. */}
      <Input id={inputId} data-typed-confirm-input value={typed} disabled={pending} autoComplete="off" spellCheck={false}
        onChange={(event) => setTyped(event.target.value)} className="mt-2" />
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <Button data-cancel-action variant="outline" disabled={pending} onClick={onCancel}>{cancelLabel}</Button>
        <SlideActionButton
          ariaLabel={confirmLabel}
          completeLabel=""
          disabled={blocked}
          thumbProps={{ "data-confirm-action": "" }}
          onActivate={confirm}
          onComplete={confirm}
          className="w-full max-w-[16rem]"
          fillClassName={destructive ? "bg-destructive/25" : undefined}
          thumbClassName={destructive ? "bg-destructive text-white" : undefined}
        >{confirmLabel}</SlideActionButton>
      </div>
    </DialogContent>
  </Dialog>;
}
