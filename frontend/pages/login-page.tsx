import { useEffect, useRef, useState } from "react";
import { GithubLogo, ShieldCheck } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button, StatefulButton } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { OTPInput, type OTPStatus } from "../components/motion/otp-input";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { emailLoginFailure, requestLoginCode, submitEmailLoginCode } from "../lib/email-login-data";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

type Step = "email" | "code";

export function LoginPage({
  locale,
  error,
  githubEnabled = true,
  emailCodeEnabled = true,
  requestCode = requestLoginCode,
  submit = submitEmailLoginCode,
  navigate = (path) => { window.location.href = path; },
}: {
  locale: LocaleRuntime;
  error?: string;
  githubEnabled?: boolean;
  emailCodeEnabled?: boolean;
  requestCode?: typeof requestLoginCode;
  submit?: typeof submitEmailLoginCode;
  navigate?: (path: string) => void;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [codeStatus, setCodeStatus] = useState<OTPStatus>("idle");
  const [resendIn, setResendIn] = useState(0);
  // React state is not reserved until the next render; the refs make a double
  // submit or a rapid resend impossible at the event boundary.
  const requestInFlight = useRef(false);
  const verifyInFlight = useRef(false);

  useEffect(() => {
    if (step !== "code" || resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [step, resendIn]);

  const requestFailure = (failure: unknown) => {
    const reason = emailLoginFailure(failure);
    setFormError(frontendText(locale,
      reason === "invalid" ? "LOGIN_EMAIL_INVALID"
        : reason === "unavailable" ? "LOGIN_EMAIL_UNAVAILABLE"
          : reason === "delivery" ? "LOGIN_EMAIL_DELIVERY_FAILED"
            : "LOGIN_CODE_ERROR"));
  };

  const sendCode = async () => {
    const target = email.trim();
    if (requestInFlight.current || pending) return;
    if (target.length === 0) {
      setFormError(frontendText(locale, "LOGIN_EMAIL_REQUIRED"));
      return;
    }
    requestInFlight.current = true;
    setRequesting(true);
    setFormError(undefined);
    setNotice(undefined);
    try {
      await requestCode(target);
      setEmail(target);
      setCode("");
      setCodeStatus("idle");
      setResendIn(RESEND_SECONDS);
      setNotice(frontendText(locale, "LOGIN_EMAIL_SENT"));
      setStep("code");
    } catch (failure: unknown) {
      requestFailure(failure);
    } finally {
      requestInFlight.current = false;
      setRequesting(false);
    }
  };

  const verifyCode = async (value = code) => {
    if (verifyInFlight.current || value.length !== CODE_LENGTH || email.length === 0) return;
    verifyInFlight.current = true;
    setPending(true);
    setFormError(undefined);
    setCodeStatus("idle");
    try {
      await submit(email, value);
      navigate("/");
    } catch (failure: unknown) {
      const reason = emailLoginFailure(failure);
      setFormError(frontendText(locale,
        reason === "invalid" ? "LOGIN_CODE_REQUEST_INVALID"
          : reason === "rejected" ? "LOGIN_CODE_REJECTED"
            : reason === "disabled" ? "LOGIN_CODE_DISABLED"
              : reason === "unavailable" ? "LOGIN_EMAIL_UNAVAILABLE"
                : "LOGIN_CODE_ERROR"));
      setCodeStatus("error");
    } finally {
      verifyInFlight.current = false;
      setPending(false);
    }
  };

  const changeEmail = () => {
    setStep("email");
    setCode("");
    setCodeStatus("idle");
    setFormError(undefined);
    setNotice(undefined);
    setResendIn(0);
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
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {githubEnabled
            ? <Button className="h-11 w-full" size="lg" onClick={() => { window.location.href = "/auth/github"; }}><GithubLogo size={20} weight="fill" />{frontendText(locale, "LOGIN_GITHUB")}</Button>
            : <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">{frontendText(locale, "LOGIN_GITHUB_UNAVAILABLE")}</p>}
          <div className="border-t pt-3" />
          {!emailCodeEnabled
            ? <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">{frontendText(locale, "LOGIN_EMAIL_UNAVAILABLE")}</p>
            : step === "email"
              ? <form className="space-y-3" aria-busy={requesting || undefined} onSubmit={(event) => { event.preventDefault(); void sendCode(); }}>
                <div><h2 className="text-sm font-medium">{frontendText(locale, "LOGIN_EMAIL_TITLE")}</h2><p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "LOGIN_EMAIL_DESCRIPTION")}</p></div>
                {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
                <div className="space-y-1"><Label htmlFor="login-email">{frontendText(locale, "LOGIN_EMAIL_LABEL")}</Label><Input id="login-email" type="email" autoComplete="email" value={email} disabled={requesting} onChange={(value) => { setEmail(value); if (formError) setFormError(undefined); }} /></div>
                <StatefulButton type="submit" className="h-11 w-full" size="lg" state={requesting ? "loading" : "idle"} loadingText={frontendText(locale, "LOGIN_EMAIL_SENDING")} disabled={requesting || email.trim().length === 0}>{frontendText(locale, "LOGIN_EMAIL_SEND")}</StatefulButton>
                <p className="text-center text-xs leading-relaxed text-muted-foreground">{frontendText(locale, "LOGIN_ALLOWLIST_NOTE")}</p>
              </form>
              : <div className="space-y-3">
                <div><h2 className="text-sm font-medium">{frontendText(locale, "LOGIN_CODE_TITLE")}</h2><p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "LOGIN_CODE_DESCRIPTION")} <span className="font-medium text-foreground">{email}</span></p></div>
                {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}
                <form className="space-y-3" aria-busy={pending || undefined} onSubmit={(event) => { event.preventDefault(); void verifyCode(); }}>
                  <OTPInput
                    length={CODE_LENGTH}
                    value={code}
                    onChange={(value) => { setCode(value); if (formError) setFormError(undefined); if (codeStatus !== "idle") setCodeStatus("idle"); }}
                    onComplete={(value) => { setCode(value); void verifyCode(value); }}
                    label={frontendText(locale, "LOGIN_CODE_CODE_LABEL")}
                    aria-label={frontendText(locale, "LOGIN_CODE_ARIA")}
                    errorMessage={formError}
                    status={codeStatus}
                    disabled={pending}
                    autoFocus
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">{frontendText(locale, "LOGIN_CODE_EXPIRY_NOTE")}</p>
                  <StatefulButton type="submit" className="h-11 w-full" size="lg" state={pending ? "loading" : "idle"} loadingText={frontendText(locale, "LOGIN_CODE_PENDING")} disabled={pending || code.length !== CODE_LENGTH}>{frontendText(locale, "LOGIN_CODE_SUBMIT")}</StatefulButton>
                </form>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="ghost" size="sm" disabled={requesting || pending || resendIn > 0} onClick={() => void sendCode()}>
                    {resendIn > 0 ? frontendText(locale, "LOGIN_CODE_RESEND_WAIT").replace("{seconds}", String(resendIn)) : frontendText(locale, "LOGIN_CODE_RESEND")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={requesting || pending} onClick={changeEmail}>{frontendText(locale, "LOGIN_CODE_CHANGE_EMAIL")}</Button>
                </div>
                <p className="text-center text-xs leading-relaxed text-muted-foreground">{frontendText(locale, "LOGIN_ALLOWLIST_NOTE")}</p>
              </div>}
        </CardContent>
      </Card>
    </div>
  </main>;
}
