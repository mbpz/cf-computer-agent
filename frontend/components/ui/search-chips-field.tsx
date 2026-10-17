"use client";

import { MorphingSearchChips, type MorphingSearchChipsLabels } from "../motion/morphing-search-chips";
import type { AppliedFilter } from "./applied-filters";
import type { ReactNode } from "react";

/**
 * The 知识检索 page's query field and applied conditions, as one beUI
 * `morphing-search-chips` bar. The docked bar owns the field, the removable
 * chips and their motion; this adapter keeps the page's contracts instead of
 * the payload's search-panel ones:
 *
 * - `id`/`name`/`role` and the accessibility attributes land on the field
 *   (`#knowledge-search`, `name="q"`), and the field stays inside the page's
 *   `<form>`, so Enter submits the query exactly as the plain input did.
 * - The applied conditions keep the shared `AppliedFilter` shape: a removal is
 *   reported through the chip's own `onRemove`, and the group keeps
 *   `data-applied-filters`/`role="group"`/its localized name only while a
 *   condition is applied.
 * - The payload's suggestions panel is not used here (the page's results are
 *   the table below), so `open` is held false and the bar is asked to stay
 *   expanded; no collapsed combobox is exposed.
 * - `chipsDisabled` stays independent of the field, so removing a condition is
 *   still available while a saved-view write locks the query, as it was when
 *   the chips came from `ui/applied-filters`.
 */
export function SearchChipsField({ id, name = "q", label, placeholder, query, onQueryChange, disabled = false, expanded = true, chips, appliedLabel, clearLabel, removeChipLabel, markedChipLabel, removedChipLabel, hint = null, actions, className }: {
  id: string;
  name?: string;
  /** Accessible name of the field; the page also renders its visible label. */
  label: string;
  placeholder: string;
  query: string;
  onQueryChange?: (query: string) => void;
  disabled?: boolean;
  expanded?: boolean;
  /** The applied conditions, in the shared `AppliedFilters` shape. */
  chips?: readonly AppliedFilter[];
  /** Names the applied-condition group; omitted groups render no group role. */
  appliedLabel?: string;
  /** Prefixed to every chip's remove name, matching `ui/applied-filters`. */
  clearLabel: string;
  removeChipLabel?: (chip: string) => string;
  markedChipLabel?: (chip: string) => string;
  removedChipLabel?: (chip: string) => string;
  hint?: string | null;
  /** Trailing controls inside the bar: the submit and the clear-all entries. */
  actions?: ReactNode;
  className?: string;
}) {
  const applied = chips ?? [];
  const chipsLabels = applied.map((chip) => chip.label);
  const grouped = chipsLabels.length > 0 && appliedLabel !== undefined;
  const labels: MorphingSearchChipsLabels = {
    // The suggestions panel never opens on this page; its copy is unused.
    suggestions: appliedLabel ?? "",
    recent: appliedLabel ?? "",
    clear: clearLabel,
    recentSearches: appliedLabel ?? "",
    searching: "",
    removeChip: removeChipLabel ?? ((chip) => `${clearLabel}: ${chip}`),
    maxChips: () => "",
    addedChip: () => "",
    removedChip: removedChipLabel ?? (() => ""),
    removedRecent: () => "",
    clearedRecents: "",
    markedChip: markedChipLabel ?? (() => ""),
    hint,
  };
  return <MorphingSearchChips
    label={label}
    placeholder={placeholder}
    query={query}
    onQueryChange={onQueryChange}
    disabled={disabled}
    chipsDisabled={false}
    open={false}
    expanded={expanded}
    chips={chipsLabels}
    onChipsChange={(next) => {
      // The payload only removes here (the panel that adds terms stays closed),
      // so a label missing from `next` is the condition its owner removes.
      for (const chip of applied) if (!next.includes(chip.label)) chip.onRemove();
    }}
    labels={labels}
    inputProps={{
      id,
      name,
      autoComplete: "off",
      // A plain search field, not a collapsed combobox: the panel is not used.
      role: "searchbox",
      "aria-expanded": undefined,
      "aria-autocomplete": undefined,
      "aria-controls": undefined,
      "aria-activedescendant": undefined,
    }}
    chipsProps={grouped ? { "data-applied-filters": "", role: "group", "aria-label": appliedLabel } : undefined}
    actions={actions}
    className={className}
  />;
}
