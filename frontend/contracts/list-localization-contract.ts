import type { DataTableProps } from "../components/data-table";
import { frontendPaginationLabels } from "../lib/i18n";

type Assert<T extends true> = T;
type RejectsUndefined<T> = undefined extends T ? false : true;
type Required<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;

// Callers must supply the list's accessible name and empty state, so no English
// fallback can live inside the shared table.
type _DataTableRequiresAccessibleName = Assert<Required<DataTableProps<unknown>, "ariaLabel">>;
type _AccessibleNameIsText = Assert<RejectsUndefined<DataTableProps<unknown>["ariaLabel"]>>;
type _DataTableRequiresEmptyState = Assert<Required<DataTableProps<unknown>, "emptyState">>;
// The surviving cursor pager (discussion threads) still refuses an undefined locale.
type _LabelMapperRejectsUndefinedLocale = Assert<RejectsUndefined<Parameters<typeof frontendPaginationLabels>[0]>>;
