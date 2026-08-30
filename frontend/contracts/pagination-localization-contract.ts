import { type DataPaginationLocalization, frontendPaginationLabels } from "../lib/i18n";

type Assert<T extends true> = T;
type RejectsUndefined<T> = undefined extends T ? false : true;

type _DataPaginationRejectsUndefinedLocale = Assert<RejectsUndefined<Extract<DataPaginationLocalization, { locale: unknown }>["locale"]>>;
type _LabelMapperRejectsUndefinedLocale = Assert<RejectsUndefined<Parameters<typeof frontendPaginationLabels>[0]>>;
