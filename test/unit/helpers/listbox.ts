import { act } from "react";

/**
 * Drives a beUI select (`ui/select` -> `motion/select`) the way a person does:
 * open the named trigger, then choose an option from the listbox that belongs to
 * the same field. A suite that used to set `select.value` and dispatch a native
 * `change` event uses this instead — the picker is a `button[aria-haspopup]`
 * plus `[role="option"]` buttons, so there is no element value to set.
 *
 * `option` is the option's trimmed text, or a 0-based index into the enabled
 * options (the disabled placeholder rows are skipped).
 */
export async function chooseOption(trigger: Element | null, option: string | number): Promise<void> {
  if (!trigger) throw new Error("chooseOption: trigger not found");
  const field = trigger.parentElement;
  if (!field) throw new Error("chooseOption: trigger has no field wrapper");
  await act(async () => { (trigger as HTMLElement).click(); });
  const options = [...field.querySelectorAll<HTMLButtonElement>('[role="option"]')].filter((node) => !node.hasAttribute("disabled"));
  const chosen = typeof option === "number" ? options[option] : options.find((node) => node.textContent?.trim() === option);
  if (!chosen) throw new Error(`chooseOption: no option ${String(option)} among ${options.map((node) => node.textContent?.trim()).join(" | ")}`);
  await act(async () => { chosen.click(); });
}

/** Lets the pending work a picker started (a request, a state commit) settle. */
export async function settle(): Promise<void> {
  // The worker target lib predates `Promise.withResolvers`, so this uses the same
  // timer idiom the rest of the suite uses to let a macrotask round trip finish.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}

/** Chooses by option value, the `select.value = "…"` shape a suite already had. */
export async function chooseValue(trigger: Element | null, value: string): Promise<void> {
  if (!trigger) throw new Error("chooseValue: trigger not found");
  const field = trigger.parentElement;
  if (!field) throw new Error("chooseValue: trigger has no field wrapper");
  await act(async () => { (trigger as HTMLElement).click(); });
  const option = field.querySelector<HTMLButtonElement>(`[role="option"][data-value="${value}"]`);
  if (!option) throw new Error(`chooseValue: no option with value ${value}`);
  await act(async () => { option.click(); });
}

/**
 * The value a field currently holds: a text field's `value`, or a picker's
 * selected option value — the read a suite used to do with `select.value`.
 */
export function fieldValue(node: Element | null): string {
  if (!node) throw new Error("fieldValue: field not found");
  if (node.getAttribute("aria-haspopup") === "listbox") {
    const selected = node.parentElement?.querySelector('[role="option"][aria-selected="true"]');
    return selected?.getAttribute("data-value") ?? "";
  }
  return (node as HTMLInputElement).value;
}
