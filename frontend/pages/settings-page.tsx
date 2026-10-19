import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { PageHeader } from "../components/ui/page-header";
import { MyInvitationCard } from "../components/settings/my-invitation-card";
import { ChangePasswordCard } from "../components/settings/change-password-card";
import { frontendText, LOCALE_STORAGE_KEY, type LocaleRuntime } from "../lib/i18n";
import { createMyInvitation, loadMyInvitation } from "../lib/invitations-data";
import { applyTheme, readTheme, type ThemeMode } from "../lib/theme";

type SettingsPreference = "theme" | "language";
type SettingsSaveState =
  | { kind: "idle" }
  | { kind: "saving"; preference: SettingsPreference }
  | { kind: "saved"; preference: SettingsPreference }
  | { kind: "failed"; preference: SettingsPreference };

export function SettingsPage({ locale, email, role, loadInvitation, createInvitation }: { locale: LocaleRuntime; email: string; role: "admin" | "contributor"; loadInvitation?: typeof loadMyInvitation; createInvitation?: typeof createMyInvitation }) {
  const [theme, setTheme] = useState<ThemeMode>("system");
  useEffect(() => setTheme(readTheme(window.localStorage)), []);
  const [save, setSave] = useState<SettingsSaveState>({ kind: "idle" });
  const saving = useRef(false);
  const alive = useRef(true);
  const lastCommit = useRef<{ preference: SettingsPreference; write: () => boolean } | null>(null);
  useEffect(() => () => { alive.current = false; }, []);
  // A preference commits through one observable boundary: while the write is in
  // flight the page reports pending, and only a settled write may report saved —
  // a browser that rejects the write is a visible failure, never a quiet success.
  const commit = (preference: SettingsPreference, write: () => boolean) => {
    if (saving.current) return;
    saving.current = true;
    lastCommit.current = { preference, write };
    setSave({ kind: "saving", preference });
    void Promise.resolve().then(() => {
      let saved = false;
      try { saved = write(); } catch { saved = false; }
      if (!alive.current) return;
      saving.current = false;
      setSave(saved ? { kind: "saved", preference } : { kind: "failed", preference });
    });
  };
  const chooseTheme = (mode: ThemeMode) => {
    if (mode === theme || saving.current) return;
    setTheme(mode);
    commit("theme", () => applyTheme(mode, document, window.localStorage));
  };
  // The runtime switches immediately; the durable write is the part that can fail.
  const chooseLanguage = (next: string) => {
    if (next === locale.locale || saving.current) return;
    commit("language", () => {
      locale.setLocale(next);
      try { window.localStorage.setItem(LOCALE_STORAGE_KEY, next); return true; } catch { return false; }
    });
  };
  const retrySave = () => {
    const pending = lastCommit.current;
    if (pending && !saving.current) commit(pending.preference, pending.write);
  };
  return <section className="mx-auto max-w-3xl space-y-6"><PageHeader title={frontendText(locale, "SETTINGS_TITLE")} description={frontendText(locale, "SETTINGS_DESCRIPTION")} /><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>{frontendText(locale, "SETTINGS_ACCOUNT")}</CardTitle><CardDescription>{frontendText(locale, "SETTINGS_ACCOUNT_DESCRIPTION")}</CardDescription></CardHeader><CardContent className="space-y-3"><div><p className="text-xs text-muted-foreground">{frontendText(locale, "SETTINGS_EMAIL")}</p><p className="mt-1 text-sm font-medium">{email || frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</p></div><div><p className="text-xs text-muted-foreground">{frontendText(locale, "SETTINGS_ROLE")}</p><p className="mt-1 text-sm font-medium">{role === "admin" ? frontendText(locale, "SHELL_ADMIN_ROLE") : frontendText(locale, "SHELL_MEMBER_ROLE")}</p></div></CardContent></Card><Card><CardHeader><CardTitle>{frontendText(locale, "SETTINGS_APPEARANCE")}</CardTitle><CardDescription>{frontendText(locale, "SETTINGS_APPEARANCE_DESCRIPTION")}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-3 gap-2">{(["light", "dark", "system"] as ThemeMode[]).map((mode) => <Button key={mode} type="button" variant={theme === mode ? "default" : "outline"} size="sm" disabled={save.kind === "saving"} aria-pressed={theme === mode} onClick={() => chooseTheme(mode)}>{frontendText(locale, mode === "light" ? "SHELL_THEME_LIGHT" : mode === "dark" ? "SHELL_THEME_DARK" : "SHELL_THEME_SYSTEM")}</Button>)}</div></CardContent></Card></div><Card><CardHeader><CardTitle>{frontendText(locale, "SETTINGS_LANGUAGE")}</CardTitle><CardDescription>{frontendText(locale, "SETTINGS_LANGUAGE_DESCRIPTION")}</CardDescription></CardHeader><CardContent><label className="flex max-w-xs items-center gap-3 text-sm"><span className="sr-only">{frontendText(locale, "SHELL_LANGUAGE_LABEL")}</span><Select value={locale.locale} disabled={save.kind === "saving"} onValueChange={(value) => chooseLanguage(value)}><SelectTrigger aria-label={frontendText(locale, "SHELL_LANGUAGE_LABEL")} className="w-auto"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="zh-CN">{frontendText(locale, "SHELL_LANGUAGE_ZH_CN")}</SelectItem><SelectItem value="en">{frontendText(locale, "SHELL_LANGUAGE_EN")}</SelectItem></SelectContent></Select></label></CardContent></Card><MyInvitationCard locale={locale} loadInvitation={loadInvitation} createInvitation={createInvitation} /><ChangePasswordCard locale={locale} /><div data-settings-save={save.kind} data-settings-save-preference={save.kind === "idle" ? undefined : save.preference}>{save.kind === "saving" && <p role="status" className="text-sm text-muted-foreground">{frontendText(locale, "SETTINGS_SAVING")}</p>}{save.kind === "saved" && <p role="status" className="text-sm text-muted-foreground">{frontendText(locale, "SETTINGS_SAVED")}</p>}{save.kind === "failed" && <Alert variant="destructive"><AlertDescription><span>{frontendText(locale, "SETTINGS_SAVE_FAILED")}</span> <Button type="button" size="sm" variant="outline" onClick={retrySave}>{frontendText(locale, "COMMON_RETRY")}</Button></AlertDescription></Alert>}</div></section>;
}
