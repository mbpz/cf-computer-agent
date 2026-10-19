import { useEffect, useMemo, useRef, useState } from "react";
import { User, UsersThree } from "@phosphor-icons/react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { PageState } from "../ui/page-state";
import { SummaryRow, type SummaryRowItem } from "../ui/summary-row";
import { FileTree, FileTreeFile, FileTreeFolder } from "../motion/file-tree";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { loadInvitationNetwork, type InvitationNetwork, type InvitationNetworkNode } from "../../lib/invitations-data";

type NetworkState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; network: InvitationNetwork };

interface ForestNode {
  node: InvitationNetworkNode;
  children: ForestNode[];
}

/**
 * The invitation-fission forest. Each member has at most one inviter (the
 * invitation bound to their account), so the relationship is a forest rather
 * than a general graph. beUI's `file-tree` is the right existing primitive: it
 * already renders a keyboard-navigable, expandable hierarchy, so no third-party
 * graph library or custom canvas is needed.
 *
 * Backfilled legacy invitations (migration 0080) and accounts with no invitation
 * are roots and are labelled so administrators do not read them as real
 * invitation edges.
 */
export function InvitationNetworkPanel({ locale, autoLoad = false, loadNetwork = loadInvitationNetwork }: { locale?: LocaleRuntime; /** The card starts expanded (used when it owns an active tab). */ autoLoad?: boolean; loadNetwork?: typeof loadInvitationNetwork }) {
  const [state, setState] = useState<NetworkState>({ kind: "loading" });
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(autoLoad);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!open) return () => { alive.current = false; };
    const controller = new AbortController();
    setState({ kind: "loading" });
    loadNetwork(fetch, controller.signal)
      .then((network) => { if (alive.current && !controller.signal.aborted) setState({ kind: "ready", network }); })
      .catch(() => { if (alive.current && !controller.signal.aborted) setState({ kind: "error" }); });
    return () => { alive.current = false; controller.abort(); };
  }, [loadNetwork, open, retry]);

  const forest = useMemo(() => state.kind === "ready" ? buildForest(state.network.nodes) : [], [state]);
  const summary: SummaryRowItem[] = state.kind === "ready" ? [
    { label: frontendText(locale, "ADMIN_NETWORK_MEMBERS"), value: state.network.stats.members },
    { label: frontendText(locale, "ADMIN_NETWORK_INVITED"), value: state.network.stats.invited },
    { label: frontendText(locale, "ADMIN_NETWORK_ROOTS"), value: state.network.stats.roots },
    { label: frontendText(locale, "ADMIN_NETWORK_DEPTH"), value: state.network.stats.maxDepth },
  ] : [];

  return <Card data-invitation-network={state.kind}>
    <CardHeader className="flex-row items-start justify-between space-y-0">
      <div><CardTitle>{frontendText(locale, "ADMIN_NETWORK_TITLE")}</CardTitle><CardDescription>{frontendText(locale, "ADMIN_NETWORK_DESCRIPTION")}</CardDescription></div>
      <Button type="button" variant="outline" data-invitation-network-toggle aria-expanded={open} onClick={() => setOpen((value) => !value)}>{frontendText(locale, open ? "ADMIN_NETWORK_CLOSE" : "ADMIN_NETWORK_OPEN")}</Button>
    </CardHeader>
    {open && <CardContent className="space-y-4">
      {state.kind === "loading" && <PageState kind="loading" title={frontendText(locale, "ADMIN_NETWORK_LOADING")} />}
      {state.kind === "error" && <PageState kind="error" title={frontendText(locale, "ADMIN_NETWORK_ERROR")}>
        <Button type="button" variant="outline" data-invitation-network-retry onClick={() => setRetry((value) => value + 1)}>{frontendText(locale, "COMMON_RETRY")}</Button>
      </PageState>}
      {state.kind === "ready" && <>
        <SummaryRow items={summary} locale={locale} />
        <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_NETWORK_LEGACY_NOTE")}</p>
        {forest.length === 0
          ? <PageState kind="empty" title={frontendText(locale, "ADMIN_NETWORK_EMPTY")} />
          : <FileTree ariaLabel={frontendText(locale, "ADMIN_NETWORK_TITLE")} defaultExpandedIds={state.kind === "ready" ? state.network.nodes.map((node) => node.id) : []} classNames={{ item: "h-auto min-h-9 py-1" }}>
            {forest.map((item) => renderBranch(item, locale))}
          </FileTree>}
      </>}
    </CardContent>}
  </Card>;
}

function renderBranch(item: ForestNode, locale: LocaleRuntime | undefined) {
  const { node, children } = item;
  const hasChildren = children.length > 0;
  const invitation = node.invitation;
  const via = invitation === null ? frontendText(locale, "ADMIN_NETWORK_NO_INVITER")
    : invitation.backfilled ? frontendText(locale, "ADMIN_NETWORK_BACKFILLED")
      : frontendText(locale, invitation.kind === "admin" ? "ADMIN_NETWORK_ADMIN_CODE" : "ADMIN_NETWORK_MEMBER_CODE");
  const name = <span className="flex min-w-0 flex-col">
    <span data-network-email={node.id} className="truncate font-medium">{node.email}</span>
    <span className="truncate text-xs text-muted-foreground">
      {via}{invitation === null ? "" : ` · ${invitation.formattedCode}`}
    </span>
  </span>;
  const action = <span className="flex shrink-0 items-center gap-1">
    <Badge variant={node.role === "admin" ? "default" : "outline"}>{frontendText(locale, node.role === "admin" ? "ADMIN_NETWORK_ROLE_ADMIN" : "ADMIN_NETWORK_ROLE_MEMBER")}</Badge>
    {node.status === "disabled" && <Badge variant="destructive">{frontendText(locale, "ADMIN_NETWORK_DISABLED")}</Badge>}
  </span>;
  const rowProps = { "data-network-member": node.id, title: `${node.email} · ${via}` } as const;
  const common = { value: node.id, name, action, rowProps };
  return hasChildren
    ? <FileTreeFolder key={node.id} icon={<UsersThree size={16} weight="duotone" />} {...common}>
      {children.map((child) => renderBranch(child, locale))}
    </FileTreeFolder>
    : <FileTreeFile key={node.id} icon={<User size={16} weight="duotone" />} {...common} />;
}

/** Builds roots and children from `inviterId`; dangling/self inviters become
 * roots and a malformed cycle is cut instead of recursing forever. */
function buildForest(nodes: readonly InvitationNetworkNode[]): ForestNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, InvitationNetworkNode[]>();
  const roots: InvitationNetworkNode[] = [];
  for (const node of nodes) {
    const inviter = node.inviterId !== null ? byId.get(node.inviterId) : undefined;
    if (!inviter || inviter.id === node.id) roots.push(node);
    else children.set(inviter.id, [...(children.get(inviter.id) ?? []), node]);
  }
  const sortNodes = (items: InvitationNetworkNode[]) => items.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.email.localeCompare(right.email));
  const seen = new Set<string>();
  const build = (node: InvitationNetworkNode, path: ReadonlySet<string>): ForestNode => {
    seen.add(node.id);
    const nextPath = new Set(path).add(node.id);
    const kids = sortNodes(children.get(node.id) ?? []).filter((child) => !nextPath.has(child.id));
    return { node, children: kids.map((child) => build(child, nextPath)) };
  };
  const forest = sortNodes(roots).map((root) => build(root, new Set()));
  // A cycle has no root; surface those nodes as roots rather than dropping them.
  for (const node of nodes) if (!seen.has(node.id)) forest.push(build(node, new Set()));
  return forest;
}
