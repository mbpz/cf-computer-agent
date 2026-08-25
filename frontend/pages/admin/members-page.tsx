import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";

export function MembersPage({ members, onStatusChange }: { members: readonly { id: string; email?: string; role?: string; status?: string }[]; onStatusChange?: (id: string, status: "active" | "disabled") => void }) {
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">Members</h1><p className="mt-1 text-sm text-muted-foreground">Manage contributor access; the Worker remains authoritative.</p></div><div className="space-y-3">{members.map((member) => { const disabled = member.status === "disabled"; return <Card key={member.id}><CardContent className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium">{member.email || "Email unavailable"}</p><p className="mt-1 text-xs text-muted-foreground">{member.role || "Role unavailable"}</p></div><div className="flex items-center gap-3"><Badge variant={disabled ? "destructive" : "success"}>{disabled ? "Disabled" : "Active"}</Badge><Button size="sm" variant="outline" onClick={() => onStatusChange?.(member.id, disabled ? "active" : "disabled")}>{disabled ? "Enable" : "Disable"}</Button></div></CardContent></Card>; })}</div></section>;
}
