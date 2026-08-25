import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export function AdminDashboardPage({ metrics }: { metrics: { pending: number; assets: number; members: number } }) {
  return <section className="space-y-6"><div><p className="text-sm font-medium text-primary">GOVERNANCE</p><h1 className="mt-2 text-2xl font-semibold">Administration</h1><p className="mt-1 text-sm text-muted-foreground">Review the workspace without bypassing server authorization.</p></div><div className="grid gap-4 md:grid-cols-3">{[["Review queue", metrics.pending], ["Asset queue", metrics.assets], ["Members", metrics.members]].map(([label, value]) => <Card key={label}><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{value}</p></CardContent></Card>)}</div></section>;
}
