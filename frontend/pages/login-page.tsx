import { useRef, useState } from "react";
import { GithubLogo, ShieldCheck } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button, StatefulButton } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import {
  loginPassword,
  passwordAuthFailure,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  registerPassword,
  resetPassword,
} from "../lib/password-auth-data";

type Mode = "login" | "register" | "reset";

export function LoginPage({
  locale,
  error,
  githubEnabled = true,
  register = registerPassword,
  login = loginPassword,
  reset = resetPassword,
  navigate = (path) => { window.location.href = path; },
}: {
  locale: LocaleRuntime;
  error?: string;
  githubEnabled?: boolean;
  register?: typeof registerPassword;
  login?: typeof loginPassword;
  reset?: typeof resetPassword;
  navigate?: (path: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recoveryDisplay, setRecoveryDisplay] = useState<string>();
  const [recoveryFor, setRecoveryFor] = useState<"register" | "reset">("register");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const inFlight = useRef(false);

  const failureKey = (failure: unknown): string => {
    const reason = passwordAuthFailure(failure);
    if (reason === "invalid") return mode === "login" ? "LOGIN_PASSWORD_INVALID" : "LOGIN_REGISTER_INVALID";
    if (reason === "weak") return "LOGIN_REGISTER_WEAK";
    if (reason === "taken") return "LOGIN_REGISTER_TAKEN";
    if (reason === "rate_limited") return "LOGIN_REGISTER_RATE_LIMITED";
    if (reason === "rejected") return "LOGIN_PASSWORD_REJECTED";
    if (reason === "locked") return "LOGIN_PASSWORD_LOCKED";
    if (reason === "disabled") return "LOGIN_PASSWORD_DISABLED";
    if (reason === "reset_rejected") return "LOGIN_RESET_REJECTED";
    if (reason === "reset_locked") return "LOGIN_RESET_LOCKED";
    return mode === "login" ? "LOGIN_PASSWORD_ERROR" : mode === "reset" ? "LOGIN_RESET_ERROR" : "LOGIN_REGISTER_ERROR";
  };

  const passwordAllowed = (value: string) => value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH && value.trim().length > 0;

  const submit = async () => {
    if (inFlight.current) return;
    const target = email.trim();
    if (target.length === 0 || password.length === 0) {
      setFormError(frontendText(locale, mode === "login" ? "LOGIN_PASSWORD_INVALID" : mode === "reset" ? "LOGIN_RESET_INVALID" : "LOGIN_REGISTER_INVALID"));
      return;
    }
    if (mode !== "login") {
      if (!passwordAllowed(password)) {
        setFormError(frontendText(locale, "LOGIN_REGISTER_WEAK"));
        return;
      }
      if (password !== confirm) {
        setFormError(frontendText(locale, "LOGIN_REGISTER_MISMATCH"));
        return;
      }
    }
    if (mode === "reset" && recoveryInput.trim().length === 0) {
      setFormError(frontendText(locale, "LOGIN_RESET_INVALID"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setFormError(undefined);
    try {
      if (mode === "register") {
        const registered = await register(target, password);
        setRecoveryDisplay(registered.recoveryCode);
        setRecoveryFor("register");
        setCopied(false);
      } else if (mode === "reset") {
        const rotated = await reset(target, recoveryInput.trim(), password);
        setRecoveryDisplay(rotated);
        setRecoveryFor("reset");
        setCopied(false);
      } else {
        await login(target, password);
        navigate("/");
      }
    } catch (failure: unknown) {
      setFormError(frontendText(locale, failureKey(failure)));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const switchMode = (next: Mode) => {
    if (pending) return;
    setMode(next);
    setPassword("");
    setConfirm("");
    setRecoveryInput("");
    setRecoveryDisplay(undefined);
    setCopied(false);
    setFormError(undefined);
  };

  const copyRecovery = async () => {
    if (!recoveryDisplay) return;
    try {
      await navigator.clipboard.writeText(recoveryDisplay);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const finishRecovery = () => {
    if (recoveryFor === "register") {
      navigate("/");
      return;
    }
    switchMode("login");
  };

  const registering = mode === "register";
  const resetting = mode === "reset";
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
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {recoveryDisplay
            ? <div className="space-y-3" data-recovery-code>
              <div>
                <h2 className="text-sm font-medium">{frontendText(locale, "LOGIN_RECOVERY_TITLE")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "LOGIN_RECOVERY_DESCRIPTION")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">{recoveryDisplay}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => void copyRecovery()}>
                  {frontendText(locale, copied ? "LOGIN_RECOVERY_COPIED" : "LOGIN_RECOVERY_COPY")}
                </Button>
              </div>
              {!copied && <p className="text-xs text-muted-foreground">{frontendText(locale, "LOGIN_RECOVERY_COPY_HINT")}</p>}
              <Button type="button" className="h-11 w-full" size="lg" onClick={finishRecovery}>
                {frontendText(locale, recoveryFor === "register" ? "LOGIN_RECOVERY_CONTINUE" : "LOGIN_RECOVERY_BACK_TO_LOGIN")}
              </Button>
            </div>
            : <>
              {githubEnabled
                ? <Button className="h-11 w-full" size="lg" onClick={() => { window.location.href = "/auth/github"; }}><GithubLogo size={20} weight="fill" />{frontendText(locale, "LOGIN_GITHUB")}</Button>
                : <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">{frontendText(locale, "LOGIN_GITHUB_UNAVAILABLE")}</p>}
              <div className="border-t pt-3" />
              <form className="space-y-3" aria-busy={pending || undefined} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                <div>
                  <h2 className="text-sm font-medium">{frontendText(locale, mode === "login" ? "LOGIN_PASSWORD_TITLE" : resetting ? "LOGIN_RESET_TITLE" : "LOGIN_REGISTER_TITLE")}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, mode === "login" ? "LOGIN_PASSWORD_DESCRIPTION" : resetting ? "LOGIN_RESET_DESCRIPTION" : "LOGIN_REGISTER_DESCRIPTION")}</p>
                </div>
                {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
                <div className="space-y-1">
                  <Label htmlFor="login-email">{frontendText(locale, "LOGIN_EMAIL_LABEL")}</Label>
                  <Input id="login-email" type="email" autoComplete="email" value={email} disabled={pending} onChange={(value) => { setEmail(value); if (formError) setFormError(undefined); }} />
                </div>
                {resetting && <div className="space-y-1">
                  <Label htmlFor="login-recovery-code">{frontendText(locale, "LOGIN_RECOVERY_CODE_LABEL")}</Label>
                  <Input id="login-recovery-code" type="text" autoComplete="off" spellCheck={false} value={recoveryInput} disabled={pending} onChange={(value) => { setRecoveryInput(value); if (formError) setFormError(undefined); }} />
                </div>}
                <div className="space-y-1">
                  <Label htmlFor="login-password">{frontendText(locale, resetting ? "LOGIN_RESET_NEW_PASSWORD_LABEL" : "LOGIN_PASSWORD_LABEL")}</Label>
                  <Input id="login-password" type="password" autoComplete={registering || resetting ? "new-password" : "current-password"} value={password} disabled={pending} onChange={(value) => { setPassword(value); if (formError) setFormError(undefined); }} />
                </div>
                {(registering || resetting) && <div className="space-y-1">
                  <Label htmlFor="login-password-confirm">{frontendText(locale, resetting ? "LOGIN_RESET_CONFIRM_LABEL" : "LOGIN_REGISTER_CONFIRM_LABEL")}</Label>
                  <Input id="login-password-confirm" type="password" autoComplete="new-password" value={confirm} disabled={pending} onChange={(value) => { setConfirm(value); if (formError) setFormError(undefined); }} />
                </div>}
                <StatefulButton type="submit" className="h-11 w-full" size="lg" state={pending ? "loading" : "idle"} loadingText={frontendText(locale, registering ? "LOGIN_REGISTER_PENDING" : resetting ? "LOGIN_RESET_PENDING" : "LOGIN_PASSWORD_PENDING")} disabled={pending || email.trim().length === 0 || password.length === 0}>
                  {frontendText(locale, registering ? "LOGIN_REGISTER_SUBMIT" : resetting ? "LOGIN_RESET_SUBMIT" : "LOGIN_PASSWORD_SUBMIT")}
                </StatefulButton>
                <div className="flex flex-wrap justify-center gap-2">
                  {mode === "login" ? <>
                    <Button type="button" variant="ghost" size="sm" disabled={pending} data-login-mode-toggle onClick={() => switchMode("register")}>{frontendText(locale, "LOGIN_SWITCH_TO_REGISTER")}</Button>
                    <Button type="button" variant="ghost" size="sm" disabled={pending} data-login-forgot onClick={() => switchMode("reset")}>{frontendText(locale, "LOGIN_FORGOT_PASSWORD")}</Button>
                  </> : <Button type="button" variant="ghost" size="sm" disabled={pending} data-login-mode-toggle onClick={() => switchMode("login")}>{frontendText(locale, "LOGIN_SWITCH_TO_LOGIN")}</Button>}
                </div>
                <p className="text-center text-xs leading-relaxed text-muted-foreground">{frontendText(locale, "LOGIN_ALLOWLIST_NOTE")}</p>
              </form>
            </>}
        </CardContent>
      </Card>
    </div>
  </main>;
}
