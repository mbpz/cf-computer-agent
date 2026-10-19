import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../ui/badge";
import { Button, StatefulButton } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { PageState } from "../ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { createMyInvitation, loadMyInvitations, type MyInvitations } from "../../lib/invitations-data";

type InvitationState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; view: MyInvitations };
type CopyState = "idle" | "copied" | "failed";

/**
 * The two invitation codes a member may see after signing in:
 *
 * 1. the code bound to their own account (used when the account was created, or
 *    backfilled by migration 0080), which is also the proof required by the
 *    unauthenticated password reset;
 * 2. their one lifetime sharing code, with the email of the member who consumed
 *    it. A used sharing code stays visible but cannot be regenerated.
 *
 * Loading is a GET: opening settings never creates state. Only the explicit
 * "create my code" click mints the sharing code (POST is idempotent).
 */
export function MyInvitationCard({ locale, loadInvitations = loadMyInvitations, createInvitation = createMyInvitation }: { locale: LocaleRuntime; loadInvitations?: typeof loadMyInvitations; createInvitation?: typeof createMyInvitation }) {
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
    loadInvitations(fetch, controller.signal)
      .then((view) => { if (alive.current && generation.current === current) setState({ kind: "ready", view }); })
      .catch(() => { if (alive.current && generation.current === current) setState({ kind: "error" }); });
  }, [loadInvitations]);

  // The mount read is a GET; the cleanup makes a late response unable to
  // overwrite a newer attempt or a removed card.
  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; generation.current += 1; read.current?.abort(); read.current = null; };
  }, [load]);

  const create = async () => {
    if (creating || state.kind !== "ready" || state.view.invitation !== null) return;
    const current = generation.current;
    setCreating(true);
    setCreateError(false);
    try {
      const view = await createInvitation();
      if (alive.current && generation.current === current) setState({ kind: "ready", view });
    } catch {
      if (alive.current && generation.current === current) setCreateError(true);
    } finally {
      if (alive.current && generation.current === current) setCreating(false);
    }
  };

  const copyCode = async (formattedCode: string) => {
    try {
      await navigator.clipboard.writeText(formattedCode);
      if (alive.current) setCopy("copied");
    } catch {
      if (alive.current) setCopy("failed");
    }
  };

  if (state.kind === "loading") return <Card data-settings-invitation="loading">
    <CardHeader><CardTitle>{frontendText(locale, "SETTINGS_INVITATION")}</CardTitle><CardDescription>{frontendText(locale, "SETTINGS_INVITATION_DESCRIPTION")}</CardDescription></CardHeader>
    <CardContent><PageState kind="loading" title={frontendText(locale, "SETTINGS_INVITATION_LOADING")} /></CardContent>
  </Card>;

  if (state.kind === "error") return <Card data-settings-invitation="error">
    <CardHeader><CardTitle>{frontendText(locale, "SETTINGS_INVITATION")}</CardTitle><CardDescription>{frontendText(locale, "SETTINGS_INVITATION_DESCRIPTION")}</CardDescription></CardHeader>
    <CardContent><div role="alert" data-settings-invitation-error className="space-y-2 text-sm text-destructive">
      <p>{frontendText(locale, "SETTINGS_INVITATION_ERROR")}</p>
      <Button type="button" variant="outline" data-settings-invitation-retry onClick={load}>{frontendText(locale, "SETTINGS_INVITATION_RETRY")}</Button>
    </div></CardContent>
  </Card>;

  const { boundInvitation, invitation } = state.view;
  return <>
    <Card data-settings-bound-invitation={boundInvitation === null ? "empty" : "ready"}>
      <CardHeader><CardTitle>{frontendText(locale, "SETTINGS_BOUND_INVITATION")}</CardTitle><CardDescription>{frontendText(locale, "SETTINGS_BOUND_INVITATION_DESCRIPTION")}</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {boundInvitation === null
          ? <p data-settings-bound-invitation-empty className="text-sm text-muted-foreground">{frontendText(locale, "SETTINGS_BOUND_INVITATION_EMPTY")}</p>
          : <>
            <div className="flex flex-wrap items-center gap-2">
              <code data-settings-bound-invitation-code={boundInvitation.code} className="rounded-md border border-border bg-muted px-3 py-1.5 font-mono text-base tracking-[0.15em] text-foreground">{boundInvitation.formattedCode}</code>
              <Badge variant="outline" data-settings-bound-invitation-status="used">{frontendText(locale, "SETTINGS_BOUND_INVITATION_USED")}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{frontendText(locale, "SETTINGS_INVITATION_CREATED_AT")} <time dateTime={boundInvitation.createdAt}>{boundInvitation.createdAt}</time></p>
            <p className="text-sm text-muted-foreground">{frontendText(locale, "SETTINGS_BOUND_INVITATION_HINT")}</p>
          </>}
      </CardContent>
    </Card>

    <Card data-settings-invitation="ready">
      <CardHeader><CardTitle>{frontendText(locale, "SETTINGS_INVITATION")}</CardTitle><CardDescription>{frontendText(locale, "SETTINGS_INVITATION_DESCRIPTION")}</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {invitation === null
          ? <div data-settings-invitation-empty className="space-y-2 text-sm text-muted-foreground">
            <p>{frontendText(locale, "SETTINGS_INVITATION_EMPTY")}</p>
            <StatefulButton type="button" data-settings-invitation-create state={creating ? "loading" : "idle"} loadingText={frontendText(locale, "SETTINGS_INVITATION_CREATING")} onClick={() => void create()}>{frontendText(locale, "SETTINGS_INVITATION_CREATE")}</StatefulButton>
            {createError && <p role="alert" data-settings-invitation-create-error className="text-destructive">{frontendText(locale, "SETTINGS_INVITATION_CREATE_FAILED")}</p>}
          </div>
          : <InvitationDetails locale={locale} invitation={invitation} copy={copy} onCopy={() => void copyCode(invitation.formattedCode)} />}
      </CardContent>
    </Card>
  </>;
}

function InvitationDetails({ locale, invitation, copy, onCopy }: { locale: LocaleRuntime; invitation: NonNullable<MyInvitations["invitation"]>; copy: CopyState; onCopy: () => void }) {
  const used = invitation.status === "used";
  return <>
    <div className="flex flex-wrap items-center gap-2">
      <code data-settings-invitation-code={invitation.code} className="rounded-md border border-border bg-muted px-3 py-1.5 font-mono text-base tracking-[0.15em] text-foreground">{invitation.formattedCode}</code>
      <Badge variant={used ? "outline" : "secondary"} data-settings-invitation-status={invitation.status}>{frontendText(locale, used ? "SETTINGS_INVITATION_USED" : "SETTINGS_INVITATION_AVAILABLE")}</Badge>
      {!used && <Button type="button" size="sm" variant="outline" data-settings-invitation-copy onClick={onCopy}>{frontendText(locale, copy === "copied" ? "SETTINGS_INVITATION_COPIED" : "SETTINGS_INVITATION_COPY")}</Button>}
    </div>
    <p className="text-xs text-muted-foreground">{frontendText(locale, "SETTINGS_INVITATION_CREATED_AT")} <time dateTime={invitation.createdAt}>{invitation.createdAt}</time></p>
    {used
      ? <div className="space-y-1">
        <p data-settings-invitation-used-note className="text-sm text-muted-foreground">{frontendText(locale, "SETTINGS_INVITATION_USED_NOTE")}</p>
        <p data-settings-invitation-bound-email className="text-sm text-muted-foreground">{frontendText(locale, "SETTINGS_INVITATION_BOUND_MEMBER")}: <span className="font-medium text-foreground">{invitation.boundEmail ?? frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</span></p>
      </div>
      : <p className="text-sm text-muted-foreground">{frontendText(locale, "SETTINGS_INVITATION_HINT")}</p>}
    {copy === "copied" && <p role="status" data-settings-invitation-copy-status="copied" className="text-sm text-muted-foreground">{frontendText(locale, "SETTINGS_INVITATION_COPIED")}</p>}
    {copy === "failed" && <p role="alert" data-settings-invitation-copy-status="failed" className="text-sm text-destructive">{frontendText(locale, "SETTINGS_INVITATION_COPY_FAILED")}</p>}
  </>;
}
