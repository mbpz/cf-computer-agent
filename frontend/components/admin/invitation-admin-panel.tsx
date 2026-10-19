import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { DataTable, type DataTableColumn } from "../data-table";
import { FilterSelect } from "../ui/filter-select";
import { AppliedFilters, type AppliedFilter } from "../ui/applied-filters";
import { PageState } from "../ui/page-state";
import { createLocaleRuntime, frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ApiRequestError, type Fetcher } from "../../lib/api";
import {
  generateAdminInvitations,
  isInvitationForbidden,
  loadAdminInvitations,
  type AdminInvitation,
  type AdminInvitationsPage,
  type InvitationKind,
  type InvitationStatus,
} from "../../lib/invitations-data";
import type { SupportedPageSize } from "../../lib/numbered-page";

type InvitationsPanelState =
  | { kind: "loading" }
  | { kind: "ready"; page: AdminInvitationsPage }
  | { kind: "error"; message: string }
  | { kind: "forbidden" };

const DEFAULT_PAGE_SIZE: SupportedPageSize = 20;
const PANEL_FALLBACK_LOCALE = createLocaleRuntime({ navigatorLanguage: "en" });

function messageOf(error: unknown, fallbackKey: string, locale?: LocaleRuntime): string {
  if (error instanceof ApiRequestError) return `${error.code}: ${error.message}`;
  // A rejected response shape carries a stable technical code; show that code
  // instead of inventing a message about what went wrong.
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,}$/u.test(error.message)) return error.message;
  return frontendText(locale, fallbackKey);
}

/**
 * Invitation-code administration on the menus page.
 *
 * Admins mint unlimited single-use codes; members own exactly one shareable code.
 * The panel re-reads the numbered, filtered list after every accepted generation so
 * the new code is visible in its authoritative place even when the current filter
 * would hide it (it is also echoed in a notice). A capability refusal is a distinct
 * forbidden state, never an empty list.
 */
export function InvitationAdminPanel({ locale, requester = fetch }: { locale?: LocaleRuntime; requester?: Fetcher }) {
  const [state, setState] = useState<InvitationsPanelState>({ kind: "loading" });
  const [status, setStatus] = useState<InvitationStatus | "">("");
  const [kind, setKind] = useState<InvitationKind | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<SupportedPageSize>(DEFAULT_PAGE_SIZE);
  const [reloadToken, setReloadToken] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<readonly AdminInvitation[]>();
  const [notice, setNotice] = useState<string>();
  const read = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    read.current?.abort();
    read.current = controller;
    setState({ kind: "loading" });
    loadAdminInvitations({ page, pageSize, status, kind, requester, signal: controller.signal })
      .then((pageData) => { if (!controller.signal.aborted) setState({ kind: "ready", page: pageData }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState(isInvitationForbidden(error)
          ? { kind: "forbidden" }
          : { kind: "error", message: messageOf(error, "ADMIN_INVITATIONS_ERROR", locale) });
      });
    return () => controller.abort();
  }, [page, pageSize, status, kind, reloadToken, requester, locale]);

  const retryRead = useCallback(() => setReloadToken((current) => current + 1), []);

  const reload = useCallback(() => {
    setGenerated(undefined);
    setNotice(undefined);
    setPage(1);
    setReloadToken((current) => current + 1);
  }, []);

  const changeStatus = (value: string) => {
    setStatus(value as InvitationStatus | "");
    setPage(1);
  };
  const changeKind = (value: string) => {
    setKind(value as InvitationKind | "");
    setPage(1);
  };

  const generate = async () => {
    if (generating || state.kind !== "ready") return;
    setGenerating(true);
    setNotice(undefined);
    try {
      const created = await generateAdminInvitations(1, requester);
      setGenerated(created);
      // The generated code joins the list at page 1; the effect above is the only
      // writer of the table, so the notice and the row never disagree.
      setPage(1);
      setReloadToken((current) => current + 1);
    } catch (error: unknown) {
      setGenerated(undefined);
      setNotice(messageOf(error, "ADMIN_INVITATIONS_GENERATE_FAILED", locale));
    } finally {
      setGenerating(false);
    }
  };

  const statusOptions = [
    { value: "", label: frontendText(locale, "ADMIN_INVITATIONS_ALL_STATUSES") },
    { value: "unused", label: frontendText(locale, "ADMIN_INVITATIONS_STATUS_UNUSED") },
    { value: "used", label: frontendText(locale, "ADMIN_INVITATIONS_STATUS_USED") },
  ];
  const kindOptions = [
    { value: "", label: frontendText(locale, "ADMIN_INVITATIONS_ALL_KINDS") },
    { value: "admin", label: frontendText(locale, "ADMIN_INVITATIONS_KIND_ADMIN") },
    { value: "member", label: frontendText(locale, "ADMIN_INVITATIONS_KIND_MEMBER") },
  ];
  const appliedFilters: AppliedFilter[] = [
    ...(status ? [{ id: "status", label: `${frontendText(locale, "ADMIN_INVITATIONS_STATUS")}: ${frontendText(locale, status === "unused" ? "ADMIN_INVITATIONS_STATUS_UNUSED" : "ADMIN_INVITATIONS_STATUS_USED")}`, onRemove: () => changeStatus("") }] : []),
    ...(kind ? [{ id: "kind", label: `${frontendText(locale, "ADMIN_INVITATIONS_KIND")}: ${frontendText(locale, kind === "admin" ? "ADMIN_INVITATIONS_KIND_ADMIN" : "ADMIN_INVITATIONS_KIND_MEMBER")}`, onRemove: () => changeKind("") }] : []),
  ];

  const columns: DataTableColumn<AdminInvitation>[] = [
    {
      key: "code",
      header: frontendText(locale, "ADMIN_INVITATIONS_CODE"),
      width: "200px",
      cell: (invitation) => <code data-admin-invitation={invitation.id} data-admin-invitation-code={invitation.code} className="font-mono text-xs tracking-[0.08em]">{invitation.formattedCode}</code>,
    },
    {
      key: "kind",
      header: frontendText(locale, "ADMIN_INVITATIONS_KIND"),
      width: "110px",
      cell: (invitation) => <Badge variant={invitation.kind === "admin" ? "default" : "outline"}>{frontendText(locale, invitation.kind === "admin" ? "ADMIN_INVITATIONS_KIND_ADMIN" : "ADMIN_INVITATIONS_KIND_MEMBER")}</Badge>,
    },
    {
      key: "owner",
      header: frontendText(locale, "ADMIN_INVITATIONS_OWNER"),
      width: "200px",
      cellClassName: "whitespace-normal",
      cell: (invitation) => <span data-admin-invitation-owner={invitation.ownerEmail ?? ""} className="text-xs text-muted-foreground">{invitation.ownerEmail ?? frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</span>,
    },
    {
      key: "bound",
      header: frontendText(locale, "ADMIN_INVITATIONS_BOUND"),
      width: "200px",
      cellClassName: "whitespace-normal",
      cell: (invitation) => <span data-admin-invitation-bound={invitation.boundEmail ?? ""} className="text-xs text-muted-foreground">{invitation.boundEmail ?? frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</span>,
    },
    {
      key: "status",
      header: frontendText(locale, "ADMIN_INVITATIONS_STATUS"),
      width: "100px",
      cell: (invitation) => <Badge variant={invitation.status === "used" ? "outline" : "secondary"}>{frontendText(locale, invitation.status === "used" ? "ADMIN_INVITATIONS_STATUS_USED" : "ADMIN_INVITATIONS_STATUS_UNUSED")}</Badge>,
    },
    {
      key: "times",
      header: frontendText(locale, "ADMIN_INVITATIONS_TIMES"),
      width: "240px",
      cellClassName: "whitespace-normal",
      cell: (invitation) => <div className="space-y-0.5 text-xs text-muted-foreground">
        <p><time dateTime={invitation.createdAt}>{invitation.createdAt}</time></p>
        <p>{invitation.usedAt ? <time dateTime={invitation.usedAt}>{invitation.usedAt}</time> : frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</p>
      </div>,
    },
  ];

  const tableLocale = locale ?? PANEL_FALLBACK_LOCALE;
  return <Card data-admin-invitations={state.kind}>
    <CardHeader>
      <CardTitle>{frontendText(locale, "ADMIN_INVITATIONS_TITLE")}</CardTitle>
      <CardDescription>{frontendText(locale, "ADMIN_INVITATIONS_DESCRIPTION")}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label={frontendText(locale, "ADMIN_INVITATIONS_STATUS")} ariaLabel={frontendText(locale, "ADMIN_INVITATIONS_STATUS_FILTER")} value={status} options={statusOptions} onChange={changeStatus} disabled={generating} />
          <FilterSelect label={frontendText(locale, "ADMIN_INVITATIONS_KIND")} ariaLabel={frontendText(locale, "ADMIN_INVITATIONS_KIND_FILTER")} value={kind} options={kindOptions} onChange={changeKind} disabled={generating} />
        </div>
        <Button type="button" data-admin-invitations-generate disabled={generating || state.kind !== "ready"} onClick={() => void generate()}>
          {frontendText(locale, generating ? "ADMIN_INVITATIONS_GENERATING" : "ADMIN_INVITATIONS_GENERATE")}
        </Button>
      </div>
      <AppliedFilters
        filters={appliedFilters}
        onClear={() => { changeStatus(""); changeKind(""); }}
        clearLabel={frontendText(locale, "COMMON_CLEAR_FILTERS")}
        ariaLabel={frontendText(locale, "COMMON_APPLIED_FILTERS")}
      />
      <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_INVITATIONS_GENERATE_HINT")}</p>
      {generated && generated.length > 0 && <Alert data-admin-invitations-generated><AlertDescription>
        {frontendText(locale, "ADMIN_INVITATIONS_GENERATED")}{" "}
        {generated.map((invitation) => <code key={invitation.id} className="mx-1 font-mono text-xs">{invitation.formattedCode}</code>)}
      </AlertDescription></Alert>}
      {notice && <p role="alert" data-admin-invitations-notice className="text-sm text-destructive">{notice}</p>}
      {state.kind === "loading" && <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />}
      {state.kind === "error" && <PageState kind="error" title={state.message} description={frontendText(locale, "ADMIN_INVITATIONS_DESCRIPTION")}>
        <Button type="button" variant="outline" onClick={retryRead}>{frontendText(locale, "COMMON_RETRY")}</Button>
      </PageState>}
      {state.kind === "forbidden" && <PageState kind="forbidden" title={frontendText(locale, "ADMIN_INVITATIONS_FORBIDDEN")} description={frontendText(locale, "ADMIN_INVITATIONS_DESCRIPTION")}>
        <Button type="button" variant="outline" onClick={retryRead}>{frontendText(locale, "COMMON_RETRY")}</Button>
      </PageState>}
      {state.kind === "ready" && <DataTable
        locale={tableLocale}
        ariaLabel={frontendText(locale, "ADMIN_INVITATIONS_TITLE")}
        rows={state.page.items}
        rowId={(invitation) => invitation.id}
        columns={columns}
        loading={generating}
        pagination={state.page.pagination}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        emptyState={<PageState kind="empty" title={frontendText(locale, "ADMIN_INVITATIONS_EMPTY")} description={frontendText(locale, "ADMIN_INVITATIONS_EMPTY_DESCRIPTION")} />}
      />}
      {state.kind === "ready" && <Button type="button" variant="ghost" size="sm" data-admin-invitations-reload onClick={reload}>{frontendText(locale, "ADMIN_INVITATIONS_RELOAD")}</Button>}
    </CardContent>
  </Card>;
}
