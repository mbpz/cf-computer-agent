import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../ui/badge";
import { Button, StatefulButton } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { PageState } from "../ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { createMyInvitation, loadMyInvitation, type MyInvitation } from "../../lib/invitations-data";

type InvitationState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; invitation: MyInvitation | null };
type CopyState = "idle" | "copied" | "failed";

/**
 * The member's one lifetime invitation code.
 *
 * Loading is deliberately a GET: opening settings must not create state. Only an
 * explicit "create my code" click mints the one lifetime code (POST is
 * idempotent, so a double click or reload still returns the same row). A used
 * code stays visible but has no copy action: the member has spent their single
 * share and cannot generate another. Nothing about the member who redeemed it is
 * shown.
 */
export function MyInvitationCard({ locale, loadInvitation = loadMyInvitation, createInvitation = createMyInvitation }: { locale: LocaleRuntime; loadInvitation?: typeof loadMyInvitation; createInvitation?: typeof createMyInvitation }) {
  const [state, setState] = useState<InvitationState>({ kind: "loading" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [copy, setCopy] = useState<CopyState>("idle");
  const alive = useRef(true);
  const generation = useRef(0);
  const read = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    const current = generation.current + 1;
    generation.current = current;
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    setCopy("idle");
    setCreateError(false);
    setState({ kind: "loading" });
    loadInvitation(fetch, controller.signal)
      .then((invitation) => { if (alive.current && generation.current === current) setState({ kind: "ready", invitation }); })
      .catch(() => { if (alive.current && generation.current === current) setState({ kind: "error" }); });
  }, [loadInvitation]);

  // The mount read is a GET; the cleanup makes a late response unable to
  // overwrite a newer attempt or a removed card.
  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; generation.current += 1; read.current?.abort(); read.current = null; };
  }, [load]);

  const create = async () => {
    if (creating || state.kind !== "ready" || state.invitation !== null) return;
    const current = generation.current;
    setCreating(true);
    setCreateError(false);
    try {
      const invitation = await createInvitation();
      if (alive.current && generation.current === current) setState({ kind: "ready", invitation });
    } catch {
      if (alive.current && generation.current === current) setCreateError(true);
    } finally {
      if (alive.current && generation.current === current) setCreating(false);
    }
  };

  const copyCode = async (invitation: MyInvitation) => {
    try {
      await navigator.clipboard.writeText(invitation.formattedCode);
      if (alive.current) setCopy("copied");
    } catch {
      if (alive.current) setCopy("failed");
    }
  };

  return <Card data-settings-invitation={state.kind}>
    <CardHeader><CardTitle>{frontendText(locale, "SETTINGS_INVITATION")}</CardTitle><CardDescription>{frontendText(locale, "SETTINGS_INVITATION_DESCRIPTION")}</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {state.kind === "loading" && <PageState kind="loading" title={frontendText(locale, "SETTINGS_INVITATION_LOADING")} />}
      {state.kind === "error" && <div role="alert" data-settings-invitation-error className="space-y-2 text-sm text-destructive">
        <p>{frontendText(locale, "SETTINGS_INVITATION_ERROR")}</p>
        <Button type="button" variant="outline" data-settings-invitation-retry onClick={load}>{frontendText(locale, "SETTINGS_INVITATION_RETRY")}</Button>
      </div>}
      {state.kind === "ready" && state.invitation === null && <div data-settings-invitation-empty className="space-y-2 text-sm text-muted-foreground">
        <p>{frontendText(locale, "SETTINGS_INVITATION_EMPTY")}</p>
        <StatefulButton type="button" data-settings-invitation-create state={creating ? "loading" : "idle"} loadingText={frontendText(locale, "SETTINGS_INVITATION_CREATING")} onClick={() => void create()}>{frontendText(locale, "SETTINGS_INVITATION_CREATE")}</StatefulButton>
        {createError && <p role="alert" data-settings-invitation-create-error className="text-destructive">{frontendText(locale, "SETTINGS_INVITATION_CREATE_FAILED")}</p>}
      </div>}
      {state.kind === "ready" && state.invitation !== null && <InvitationDetails locale={locale} invitation={state.invitation} copy={copy} onCopy={() => void copyCode(state.invitation!)} />}
    </CardContent>
  </Card>;
}

function InvitationDetails({ locale, invitation, copy, onCopy }: { locale: LocaleRuntime; invitation: MyInvitation; copy: CopyState; onCopy: () => void }) {
  const used = invitation.status === "used";
  return <>
    <div className="flex flex-wrap items-center gap-2">
      <code data-settings-invitation-code={invitation.code} className="rounded-md border border-border bg-muted px-3 py-1.5 font-mono text-base tracking-[0.15em] text-foreground">{invitation.formattedCode}</code>
      <Badge variant={used ? "outline" : "secondary"} data-settings-invitation-status={invitation.status}>{frontendText(locale, used ? "SETTINGS_INVITATION_USED" : "SETTINGS_INVITATION_AVAILABLE")}</Badge>
      {!used && <Button type="button" size="sm" variant="outline" data-settings-invitation-copy onClick={onCopy}>{frontendText(locale, copy === "copied" ? "SETTINGS_INVITATION_COPIED" : "SETTINGS_INVITATION_COPY")}</Button>}
    </div>
    <p className="text-xs text-muted-foreground">{frontendText(locale, "SETTINGS_INVITATION_CREATED_AT")} <time dateTime={invitation.createdAt}>{invitation.createdAt}</time></p>
    {used
      ? <p data-settings-invitation-used-note className="text-sm text-muted-foreground">{frontendText(locale, "SETTINGS_INVITATION_USED_NOTE")}</p>
      : <p className="text-sm text-muted-foreground">{frontendText(locale, "SETTINGS_INVITATION_HINT")}</p>}
    {copy === "copied" && <p role="status" data-settings-invitation-copy-status="copied" className="text-sm text-muted-foreground">{frontendText(locale, "SETTINGS_INVITATION_COPIED")}</p>}
    {copy === "failed" && <p role="alert" data-settings-invitation-copy-status="failed" className="text-sm text-destructive">{frontendText(locale, "SETTINGS_INVITATION_COPY_FAILED")}</p>}
  </>;
}
