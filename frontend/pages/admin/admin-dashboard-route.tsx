import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionSnapshot } from "../../contracts/api";
import { routeCapability } from "../../../shared/workspace-route-capabilities";
import { loadReviewQueuePage } from "../../lib/admin-review-data";
import { loadAdminAssets } from "../../lib/admin-assets-data";
import { loadAdminMembers } from "../../lib/admin-members-data";
import { ApiRequestError } from "../../lib/api";
import type { LocaleRuntime } from "../../lib/i18n";
import { routeAccessAllowed } from "../../lib/route-access";
import { AdminDashboardPage, type DashboardMetric, type DashboardMetricState } from "./admin-dashboard-page";

const metricPaths = { pending: "/admin/submissions", assets: "/admin/assets", members: "/admin/members" } as const;
const metricKeys = ["pending", "assets", "members"] as const;
const shortcuts = [
  { href: "/admin/analytics", labelKey: "NAV_SITE_ANALYTICS" },
  { href: "/admin/roles", labelKey: "NAV_ROLES" },
  { href: "/admin/menus", labelKey: "NAV_MENUS" },
];

async function loadMetric(key: DashboardMetric, signal: AbortSignal): Promise<number> {
  const input = { page: 1, pageSize: 20 as const, signal };
  const page = key === "pending" ? await loadReviewQueuePage(input)
    : key === "assets" ? await loadAdminAssets(input) : await loadAdminMembers(input);
  return page.pagination.total;
}

export function AdminDashboardRoute({ locale, session }: { locale: LocaleRuntime; session: SessionSnapshot }) {
  // A changed principal/projection must never inherit another session's counters.
  const identity = JSON.stringify([session.member.id, session.member.role, session.permissionMask, [...session.capabilities].sort()]);
  return <DashboardMetrics key={identity} locale={locale} session={session} />;
}

function DashboardMetrics({ locale, session }: { locale: LocaleRuntime; session: SessionSnapshot }) {
  const canVisit = useCallback((path: string) => {
    const route = routeCapability(path);
    return Boolean(route && routeAccessAllowed(session, route));
  }, [session]);
  const allowed = useMemo(() => Object.fromEntries(metricKeys.map((key) => [key, canVisit(metricPaths[key])])) as Record<DashboardMetric, boolean>, [canVisit]);
  const [metrics, setMetrics] = useState<Record<DashboardMetric, DashboardMetricState>>(() => Object.fromEntries(
    metricKeys.map((key) => [key, { kind: allowed[key] ? "loading" : "forbidden" }]),
  ) as Record<DashboardMetric, DashboardMetricState>);
  const active = useRef(false);
  const requests = useRef<Partial<Record<DashboardMetric, AbortController>>>({});
  const load = useCallback((key: DashboardMetric) => {
    if (!active.current || !allowed[key] || requests.current[key]) return;
    const request = new AbortController();
    requests.current[key] = request;
    setMetrics((previous) => ({ ...previous, [key]: { kind: "loading" } }));
    void loadMetric(key, request.signal).then((total) => {
      if (active.current && requests.current[key] === request) {
        setMetrics((previous) => ({ ...previous, [key]: { kind: "ready", total } }));
      }
    }).catch((error: unknown) => {
      if (active.current && requests.current[key] === request) {
        const denied = error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
        setMetrics((previous) => ({ ...previous, [key]: { kind: denied ? "forbidden" : "error" } }));
      }
    }).finally(() => {
      if (requests.current[key] === request) delete requests.current[key];
    });
  }, [allowed]);

  useEffect(() => {
    active.current = true;
    metricKeys.forEach(load);
    return () => {
      active.current = false;
      Object.values(requests.current).forEach((request) => request.abort());
      requests.current = {};
    };
  }, [load]);

  return <AdminDashboardPage locale={locale} metrics={metrics}
    links={shortcuts.filter((link) => canVisit(link.href))}
    onRetry={load} onRefresh={() => {
      if (Object.keys(requests.current).length > 0) return;
      metricKeys.forEach(load);
    }} />;
}
