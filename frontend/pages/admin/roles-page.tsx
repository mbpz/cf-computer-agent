import { DataTable } from "../../components/data-table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { writeWorkspaceHistory } from "../../lib/workspace-location";
import type { AdminRolesState } from "../../lib/admin-roles-controller";

export type { AdminRolesState };

export function adminRoleDetailPath(roleId: string): string {
  return `/admin/roles/${encodeURIComponent(roleId)}`;
}

/** The role list: a beUI table whose rows link to each role's permission detail page. */
export function AdminRolesPage({ onLoadRetry, state, locale }: { onLoadRetry?: () => void; state: AdminRolesState; locale: LocaleRuntime }) {
  // The page shell is constant (research §4.3): the header and its create action render
  // for every state; loading and read failure only replace the role table.
  return <section className="flex flex-col gap-5 lg:h-full lg:min-h-0" aria-busy={state.kind === "loading" || undefined}>
    <PageHeader title={frontendText(locale, "ADMIN_ROLES_TITLE")} description={frontendText(locale, "ADMIN_ROLES_DESCRIPTION")}
      actions={<Button type="button" onClick={() => writeWorkspaceHistory("push", "/admin/roles/new")}>{frontendText(locale, "ADMIN_ROLES_CREATE")}</Button>} />
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : state.kind !== "ready" ? <PageState kind={state.kind} title={state.message || frontendText(locale, "ADMIN_ROLES_UNAVAILABLE")}>{onLoadRetry && <Button type="button" variant="outline" onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</PageState>
      : <DataTable
      locale={locale}
      ariaLabel={frontendText(locale, "ADMIN_ROLES_TITLE")}
      rows={state.roles}
      rowId={(role) => role.id}
      fill
      rowHeight={64}
      emptyState={<PageState kind="empty" title={frontendText(locale, "ADMIN_ROLES_EMPTY")} description={frontendText(locale, "ADMIN_ROLES_DESCRIPTION")} />}
      columns={[
        {
          key: "name",
          header: frontendText(locale, "ADMIN_ROLES_NAME"),
          cellClassName: "whitespace-normal",
          cell: (role) => <div className="py-1">
            <a href={adminRoleDetailPath(role.id)} onClick={(event) => { event.preventDefault(); writeWorkspaceHistory("push", adminRoleDetailPath(role.id)); }} className="font-medium underline-offset-4 hover:underline">{role.name}</a>
            <p className="text-xs text-muted-foreground">{role.description || frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</p>
          </div>,
        },
        { key: "key", header: frontendText(locale, "ADMIN_ROLES_KEY"), width: "180px", cell: (role) => <code className="text-xs">{role.key}</code> },
        { key: "mask", header: frontendText(locale, "ADMIN_ROLES_MASK"), width: "140px", cell: (role) => <code className="text-xs">{role.allowBits}</code> },
        { key: "members", header: frontendText(locale, "ADMIN_ROLES_MEMBERS"), width: "120px", align: "right", cell: (role) => <span>{role.memberCount}</span> },
        { key: "system", header: frontendText(locale, "ADMIN_ROLES_SYSTEM"), width: "120px", cell: (role) => role.isSystem ? <Badge variant="outline">{frontendText(locale, "ADMIN_ROLES_SYSTEM")}</Badge> : null },
      ]}
    />}
  </section>;
}
