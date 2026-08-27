import { GithubLogo, ShieldCheck } from "@phosphor-icons/react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export function LoginPage({ locale, error, githubEnabled = true }: { locale: LocaleRuntime; error?: string; githubEnabled?: boolean }) {
  return <main data-login-page className="min-h-[100dvh] bg-muted/30 px-4 py-10 sm:px-6 lg:px-8">
    <div className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="max-w-xl">
        <p className="text-xs font-semibold tracking-[0.22em] text-primary">MEMORY GARDEN</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{frontendText(locale, "LOGIN_TITLE")}</h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">{frontendText(locale, "LOGIN_DESCRIPTION")}</p>
        <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground"><ShieldCheck size={20} weight="duotone" className="text-primary" />{frontendText(locale, "LOGIN_PRIVATE_NOTE")}</div>
      </section>
      <Card className="mx-auto w-full max-w-md shadow-lg shadow-primary/5">
        <CardHeader><CardTitle>{frontendText(locale, "LOGIN_CARD_TITLE")}</CardTitle><CardDescription>{frontendText(locale, "LOGIN_CARD_DESCRIPTION")}</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          {githubEnabled
            ? <Button className="h-11 w-full" size="lg" onClick={() => { window.location.href = "/auth/github"; }}><GithubLogo size={20} weight="fill" />{frontendText(locale, "LOGIN_GITHUB")}</Button>
            : <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">{frontendText(locale, "LOGIN_GITHUB_UNAVAILABLE")}</p>}
          <p className="pt-2 text-center text-xs leading-relaxed text-muted-foreground">{frontendText(locale, "LOGIN_ALLOWLIST_NOTE")}</p>
        </CardContent>
      </Card>
    </div>
  </main>;
}
