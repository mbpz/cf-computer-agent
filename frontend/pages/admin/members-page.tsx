import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

export function MembersPage({ members, onStatusChange, locale }: { members: readonly { id: string; email?: string; role?: string; status?: string }[]; onStatusChange?: (id: string, status: "active" | "disabled") => void; locale?: LocaleRuntime }) {
  if (!members.length) return <PageState kind="empty" title={frontendText(locale, "ADMIN_MEMBERS_EMPTY")} description={frontendText(locale, "ADMIN_MEMBERS_DESCRIPTION")} />;
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_MEMBERS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_MEMBERS_DESCRIPTION")}</p></div><div className="space-y-3">{members.map((member) => { const disabled = member.status === "disabled"; return <Card key={member.id}><CardContent className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium">{member.email || frontendText(locale, "ADMIN_EMAIL_UNAVAILABLE")}</p><p className="mt-1 text-xs text-muted-foreground">{member.role || frontendText(locale, "ADMIN_ROLE_UNAVAILABLE")}</p></div><div className="flex items-center gap-3"><Badge variant={disabled ? "destructive" : "success"}>{disabled ? frontendText(locale, "ADMIN_DISABLED") : frontendText(locale, "ADMIN_ACTIVE")}</Badge><Button size="sm" variant="outline" onClick={() => onStatusChange?.(member.id, disabled ? "active" : "disabled")}>{disabled ? frontendText(locale, "ADMIN_ENABLE") : frontendText(locale, "ADMIN_DISABLE")}</Button></div></CardContent></Card>; })}</div></section>;
}
