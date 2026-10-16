import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionSnapshot } from "../../contracts/api";
import { routeCapability } from "../../../shared/workspace-route-capabilities";
import { loadReviewQueuePage } from "../../lib/admin-review-data";
import { loadAdminAssets } from "../../lib/admin-assets-data";
import { loadAdminMembers } from "../../lib/admin-members-data";
import { loadAdminDashboardSummary, type AdminDashboardActivityEvent, type AdminDashboardTrendPoint } from "../../lib/admin-dashboard-data";
import { ApiRequestError } from "../../lib/api";
import type { LocaleRuntime } from "../../lib/i18n";
import { routeAccessAllowed } from "../../lib/route-access";
import { AdminDashboardPage, type DashboardMetric, type DashboardMetricState, type DashboardSectionState } from "./admin-dashboard-page";
import { MaintenanceStatusPanel } from "../../components/admin/maintenance-status-panel";

const metricPaths = { pending: "/admin/submissions", assets: "/admin/assets", members: "/admin/members" } as const;
const metricKeys = ["pending", "assets", "members"] as const;
// `submission:read-all` is the capability that already gates the `/admin` entry,
// which is exactly the capability `GET /api/admin/summary` requires.
const summaryPath = "/admin";
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

interface DashboardSummaryState {
  trend: DashboardSectionState<AdminDashboardTrendPoint[]>;
  activity: DashboardSectionState<AdminDashboardActivityEvent[]>;
}

export function AdminDashboardRoute({ locale, session }: { locale: LocaleRuntime; session: SessionSnapshot }) {
  // A changed principal/projection must never inherit another session's counters.
  const identity = JSON.stringify([session.member.id, session.member.role, session.permissionMask, [...session.capabilities].sort()]);
  // The instance maintenance state is an operations read of the same admin entry,
  // so it mounts beside the metrics and loads on its own.
  return <><DashboardMetrics key={identity} locale={locale} session={session} /><MaintenanceStatusPanel locale={locale} /></>;
}

function DashboardMetrics({ locale, session }: { locale: LocaleRuntime; session: SessionSnapshot }) {
  const canVisit = useCallback((path: string) => {
    const route = routeCapability(path);
    return Boolean(route && routeAccessAllowed(session, route));
  }, [session]);
  const allowed = useMemo(() => Object.fromEntries(metricKeys.map((key) => [key, canVisit(metricPaths[key])])) as Record<DashboardMetric, boolean>, [canVisit]);
  const summarizable = canVisit(summaryPath);
  const [metrics, setMetrics] = useState<Record<DashboardMetric, DashboardMetricState>>(() => Object.fromEntries(
    metricKeys.map((key) => [key, { kind: allowed[key] ? "loading" : "forbidden" }]),
  ) as Record<DashboardMetric, DashboardMetricState>);
  const [summary, setSummary] = useState<DashboardSummaryState>(() => ({
    trend: { kind: summarizable ? "loading" : "forbidden" },
    activity: { kind: summarizable ? "loading" : "forbidden" },
  }));
  const active = useRef(false);
  const requests = useRef<Partial<Record<DashboardMetric, AbortController>>>({});
  const summaryRequest = useRef<AbortController | null>(null);
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
  // Trend and activity come from one consistent server snapshot but each section
  // renders and retries on its own, and neither ever shows a fabricated zero.
  const loadSummary = useCallback(() => {
    if (!active.current || !summarizable || summaryRequest.current) return;
    const request = new AbortController();
    summaryRequest.current = request;
    setSummary({ trend: { kind: "loading" }, activity: { kind: "loading" } });
    void loadAdminDashboardSummary({ signal: request.signal }).then((loaded) => {
      if (active.current && summaryRequest.current === request) {
        setSummary({ trend: { kind: "ready", items: loaded.trend }, activity: { kind: "ready", items: loaded.activity } });
      }
    }).catch((error: unknown) => {
      if (active.current && summaryRequest.current === request) {
        const denied = error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
        setSummary({ trend: { kind: denied ? "forbidden" : "error" }, activity: { kind: denied ? "forbidden" : "error" } });
      }
    }).finally(() => {
      if (summaryRequest.current === request) summaryRequest.current = null;
    });
  }, [summarizable]);

  useEffect(() => {
    active.current = true;
    metricKeys.forEach(load);
    loadSummary();
    return () => {
      active.current = false;
      Object.values(requests.current).forEach((request) => request.abort());
      requests.current = {};
      summaryRequest.current?.abort();
      summaryRequest.current = null;
    };
  }, [load, loadSummary]);

  const refresh = useCallback(() => {
    if (Object.keys(requests.current).length > 0) return;
    metricKeys.forEach(load);
    loadSummary();
  }, [load, loadSummary]);

  return <AdminDashboardPage locale={locale} metrics={metrics} trend={summary.trend} activity={summary.activity}
    links={shortcuts.filter((link) => canVisit(link.href))}
    onRetry={load} onRetryTrend={loadSummary} onRetryActivity={loadSummary} onRefresh={refresh} />;
}
