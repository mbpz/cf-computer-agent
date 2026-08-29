import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";

export function ComingSoonPage({ locale }: { locale: LocaleRuntime }) {
  return <section className="mx-auto max-w-2xl py-10"><Card><CardContent className="p-6 sm:p-8"><Badge variant="outline">{frontendText(locale, "NAV_COMING_SOON")}</Badge><h1 className="mt-4 text-2xl font-semibold">{frontendText(locale, "PAGE_COMING_SOON_TITLE")}</h1><p className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "PAGE_COMING_SOON_DESCRIPTION")}</p></CardContent></Card></section>;
}
