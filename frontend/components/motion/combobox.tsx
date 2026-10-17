"use client";
// beui.dev/components/motion/combobox
//
// §17 localization-fork patches for the filter rows (docs/product/2026-10-17-beui-full-adoption-matrix.md §17):
//   1. labels — every string the a11y tree can reach is a prop (`ComboboxTriggerProps.label`,
//      `ComboboxListProps.ariaLabel`, `ComboboxEmptyProps.children`); the caller passes
//      `frontendText(locale, …)`, so no English default is ever the only value.
//   2. attribute passthrough — `ComboboxTrigger` takes a `render` element slot plus `...rest`,
//      and `ComboboxContent`/`ComboboxList`/`ComboboxItem` spread `...rest`, so `data-*`,
//      `aria-*` and `role` reach the trigger button, the panel and the option rows.
//   4. callback extension — `ComboboxTriggerProps.keyboard="trigger"` routes the payload's own
//      key handling (`moveActive`/`selectActive`/`setOpen`) through the trigger instead of an
//      inner `ComboboxInput`, because a filter row is a listbox button, not a text box.
//
// Contract preserved: the filter row keeps `button[aria-haspopup="listbox"]` with the
// historical name in a `.sr-only` span and the same `button:disabled` state
// (frontend/components/ui/filter-select.tsx:22; test/unit/frontend-tasks-page.test.tsx:34-38,
// test/unit/frontend-admin-queue-filters.test.tsx:37-40,101) and its options stay inside the
// field so `trigger.parentElement.querySelectorAll('[role="option"]')` still addresses them
// (test/unit/frontend-tasks-page.test.tsx:143,167) — `ComboboxContent inline` renders the panel
// in the field instead of a body portal, the same decision `ui/date-range-input.tsx` records.

export {
  ComboboxContent,
  type ComboboxContentProps,
} from "./combobox/content";
export {
  Combobox,
  type ComboboxFilter,
  type ComboboxProps,
} from "./combobox/context";
export {
  ComboboxEmpty,
  type ComboboxEmptyProps,
  ComboboxGroup,
  type ComboboxGroupProps,
  ComboboxItem,
  type ComboboxItemProps,
  ComboboxLabel,
  type ComboboxLabelProps,
  ComboboxList,
  type ComboboxListProps,
  ComboboxSeparator,
  type ComboboxSeparatorProps,
} from "./combobox/list";
export {
  ComboboxInput,
  type ComboboxInputProps,
  ComboboxTrigger,
  type ComboboxTriggerProps,
  ComboboxValue,
  type ComboboxValueProps,
} from "./combobox/trigger";
