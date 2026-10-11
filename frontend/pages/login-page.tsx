import { useState } from "react";
import { GithubLogo, ShieldCheck } from "@phosphor-icons/react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { loginCodeFailure, submitLoginCode } from "../lib/admin-member-invitations-data";

export function LoginPage({ locale, error, githubEnabled = true, submit = submitLoginCode, navigate = (path) => { window.location.href = path; } }: { locale: LocaleRuntime; error?: string; githubEnabled?: boolean; submit?: typeof submitLoginCode; navigate?: (path: string) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const canSubmit = !pending && email.trim().length > 0 && code.trim().length > 0;
  const onCodeSubmit = async () => {
    if (!canSubmit) return;
    setPending(true); setFormError(undefined);
    try {
      await submit(email.trim(), code.trim());
      navigate("/");
    } catch (failure: unknown) {
      // A verification failure (401) is deliberately indistinguishable from any other
      // rejected credential, so the page can only ever show one generic message for it.
      const reason = loginCodeFailure(failure);
      setFormError(frontendText(locale, reason === "invalid" ? "LOGIN_CODE_REQUEST_INVALID" : reason === "rejected" ? "LOGIN_CODE_REJECTED" : "LOGIN_CODE_ERROR"));
    } finally {
      setPending(false);
    }
  };
  return <main data-login-page className="min-h-[100dvh] bg-muted/30 px-4 py-10 sm:px-6 lg:px-8">
    <div className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="max-w-xl">
        <p className="text-sm font-semibold text-primary">{frontendText(locale, "APP_BRAND_EYEBROW")}</p>
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
          <div className="border-t pt-3" />
          <form className="space-y-3" aria-busy={pending || undefined} onSubmit={(event) => { event.preventDefault(); void onCodeSubmit(); }}>
            <div><h2 className="text-sm font-medium">{frontendText(locale, "LOGIN_CODE_TITLE")}</h2><p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "LOGIN_CODE_DESCRIPTION")}</p></div>
            {formError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{formError}</p>}
            <div className="space-y-1"><Label htmlFor="login-code-email">{frontendText(locale, "LOGIN_CODE_EMAIL_LABEL")}</Label><Input id="login-code-email" type="email" autoComplete="email" value={email} disabled={pending} onChange={(event) => setEmail(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="login-code-code">{frontendText(locale, "LOGIN_CODE_CODE_LABEL")}</Label><Input id="login-code-code" type="text" autoComplete="one-time-code" className="font-mono" value={code} disabled={pending} onChange={(event) => setCode(event.target.value)} /></div>
            <Button type="submit" className="h-11 w-full" size="lg" disabled={!canSubmit}>{frontendText(locale, pending ? "LOGIN_CODE_PENDING" : "LOGIN_CODE_SUBMIT")}</Button>
          </form>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">{frontendText(locale, "LOGIN_ALLOWLIST_NOTE")}</p>
        </CardContent>
      </Card>
    </div>
  </main>;
}
