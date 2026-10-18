import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

/**
 * The single forbidden surface: the shell renders it for any route the session cannot
 * reach, and it keeps its own admin-scoped copy as the default. It carries the
 * `data-page-state="forbidden"` and `role="alert"` hooks the shell contract asserts.
 */
export function AdminForbiddenPage({ locale, title, description }: { locale?: LocaleRuntime; title?: string; description?: string }) {
  return <section data-page-state="forbidden" role="alert" className="mx-auto max-w-xl py-16">
    <Alert variant="destructive">
      <AlertTitle><h1 className="text-base font-semibold leading-5">{title ?? frontendText(locale, "ADMIN_FORBIDDEN_TITLE")}</h1></AlertTitle>
      <AlertDescription>{description ?? frontendText(locale, "ADMIN_FORBIDDEN_DESCRIPTION")}</AlertDescription>
    </Alert>
  </section>;
}
