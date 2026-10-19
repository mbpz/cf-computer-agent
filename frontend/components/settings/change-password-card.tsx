import { useRef, useState } from "react";
import { Alert, AlertDescription } from "../ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { StatefulButton } from "../ui/button";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { changePassword as submitPasswordChange } from "../../lib/password-auth-data";

/**
 * Authenticated password change / first password.
 *
 * Accounts created before invitation codes have no bound reset code, but a live
 * session still proves ownership: an existing password must be typed again, and
 * an account without a password (for example a GitHub-only member) may set its
 * first one. The server revokes the member's other sessions and keeps this one.
 */
export function ChangePasswordCard({ locale, changePassword = submitPasswordChange }: { locale: LocaleRuntime; changePassword?: typeof submitPasswordChange }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const inFlight = useRef(false);

  const submit = async () => {
    if (inFlight.current) return;
    if (next.length < 12 || next.length > 128 || next.trim().length === 0) {
      setNotice(undefined);
      setFormError(frontendText(locale, "SETTINGS_PASSWORD_WEAK"));
      return;
    }
    if (next !== confirm) {
      setNotice(undefined);
      setFormError(frontendText(locale, "SETTINGS_PASSWORD_MISMATCH"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setFormError(undefined);
    setNotice(undefined);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setNotice(frontendText(locale, "SETTINGS_PASSWORD_CHANGED"));
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
      setFormError(frontendText(locale,
        code === "PASSWORD_POLICY_INVALID" ? "SETTINGS_PASSWORD_WEAK"
          : code === "PASSWORD_CHANGE_INVALID" ? "SETTINGS_PASSWORD_CURRENT_INVALID"
            : "SETTINGS_PASSWORD_FAILED"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return <Card data-settings-password="ready">
    <CardHeader><CardTitle>{frontendText(locale, "SETTINGS_PASSWORD")}</CardTitle><CardDescription>{frontendText(locale, "SETTINGS_PASSWORD_DESCRIPTION")}</CardDescription></CardHeader>
    <CardContent>
      <form className="space-y-3" aria-busy={pending || undefined} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="space-y-1">
          <Label htmlFor="settings-current-password">{frontendText(locale, "SETTINGS_PASSWORD_CURRENT")}</Label>
          <Input id="settings-current-password" type="password" autoComplete="current-password" value={current} disabled={pending} onChange={(value) => { setCurrent(value); if (formError) setFormError(undefined); }} />
          <p className="text-xs text-muted-foreground">{frontendText(locale, "SETTINGS_PASSWORD_CURRENT_HINT")}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="settings-new-password">{frontendText(locale, "SETTINGS_PASSWORD_NEW")}</Label>
          <Input id="settings-new-password" type="password" autoComplete="new-password" value={next} disabled={pending} onChange={(value) => { setNext(value); if (formError) setFormError(undefined); }} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="settings-confirm-password">{frontendText(locale, "SETTINGS_PASSWORD_CONFIRM")}</Label>
          <Input id="settings-confirm-password" type="password" autoComplete="new-password" value={confirm} disabled={pending} onChange={(value) => { setConfirm(value); if (formError) setFormError(undefined); }} />
        </div>
        {formError && <Alert variant="destructive"><AlertDescription><span role="alert" data-settings-password-error>{formError}</span></AlertDescription></Alert>}
        {notice && <p role="status" data-settings-password-status="changed" className="text-sm text-muted-foreground">{notice}</p>}
        <StatefulButton type="submit" data-settings-password-submit state={pending ? "loading" : "idle"} loadingText={frontendText(locale, "SETTINGS_PASSWORD_SAVING")} disabled={pending || next.length === 0}>{frontendText(locale, "SETTINGS_PASSWORD_SAVE")}</StatefulButton>
      </form>
    </CardContent>
  </Card>;
}
