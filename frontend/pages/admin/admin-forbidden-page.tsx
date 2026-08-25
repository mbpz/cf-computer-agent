import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

export function AdminForbiddenPage({ locale }: { locale?: LocaleRuntime }) {
  return <section className="mx-auto max-w-xl py-16"><Alert variant="destructive"><AlertTitle>{frontendText(locale, "ADMIN_FORBIDDEN_TITLE")}</AlertTitle><AlertDescription>{frontendText(locale, "ADMIN_FORBIDDEN_DESCRIPTION")}</AlertDescription></Alert></section>;
}
