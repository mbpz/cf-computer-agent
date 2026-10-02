import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { FrontendPageRequest } from "../lib/numbered-page";
import { loadProjectRelations, setProjectRelation, type ProjectRelation, type ProjectRelationKind, type ProjectRelationPage } from "../lib/project-relations-data";
import { loadProjectSummary, type ProjectSummary } from "../lib/projects-data";
import type { PlanningWriteRecord } from "../lib/planning-write-recovery";
import { DataPagination } from "./data-pagination";
import { Button } from "./ui/button";
import { ConfirmAction } from "./ui/confirm-action";
import { registerWorkspaceLeaveGuard } from "../lib/workspace-location";

interface Props {
  projectId: string; title: string; locale: LocaleRuntime;
  onSummary: (projectId: string, summary: ProjectSummary | undefined) => void;
  onDenied: (error: unknown) => boolean;
  onClose: () => void;
  onBeginWrite: (id: string, version: string) => PlanningWriteRecord | null;
  onFinishWrite: (record: PlanningWriteRecord) => boolean;
  writeBlocked: boolean;
}

export function ProjectRelationsEditor({ projectId, title, locale, onSummary, onDenied, onClose, onBeginWrite, onFinishWrite, writeBlocked }: Props) {
  type Decision = { item: ProjectRelation; page: ProjectRelationPage; epoch: number };
  const [decision, setDecision] = useState<Decision | null>(null);
  const decisionRef = useRef<Decision | null>(null);
  const dataRef = useRef<ProjectRelationPage | undefined>(undefined);
  const active = useRef(true);
  const writingRef = useRef(false);
  const blockedRef = useRef(writeBlocked); blockedRef.current = writeBlocked;
  const [kind, setKind] = useState<ProjectRelationKind>("goals");
  const [request, setRequest] = useState<FrontendPageRequest>({ page: 1, pageSize: 20 });
  const [data, setData] = useState<ProjectRelationPage>();
  const [busy, setBusy] = useState(true);
  const [writing, setWriting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string>();
  const busyRef = useRef(true);
  const generation = useRef(0);
  const pendingWrite = useRef<PlanningWriteRecord | null>(null);
  const controller = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const text = (key: string) => frontendText(locale, key);
  const denied = (error: unknown) => error instanceof ApiRequestError && [401, 403, 404].includes(error.status);

  const read = useCallback(async () => {
    if (!active.current || decisionRef.current) return;
    dataRef.current = undefined;
    controller.current?.abort();
    const current = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    busyRef.current = true; setBusy(true); setFailed(false); setData(undefined); onSummary(projectId, undefined);
    try {
      const [page, summary] = await Promise.all([
        loadProjectRelations(projectId, kind, request, fetch, abort.signal),
        loadProjectSummary(projectId, fetch, abort.signal),
      ]);
      if (generation.current !== current || abort.signal.aborted) return;
      const record = pendingWrite.current;
      if (record && Date.parse(page.expectedUpdatedAt) < Date.parse(record.expectedUpdatedAt)) throw new Error("Regressed project relation version");
      dataRef.current = page; setData(page); onSummary(projectId, summary);
      // A fresh read releases the barrier, not proof that the original write succeeded.
      if (record && onFinishWrite(record)) pendingWrite.current = null;
    } catch (error) {
      if (generation.current !== current || abort.signal.aborted) return;
      if (denied(error)) { onDenied(error); return; }
      setFailed(true);
    } finally {
      if (generation.current === current && !abort.signal.aborted) { busyRef.current = false; setBusy(false); }
    }
  }, [projectId, kind, request, onSummary, onDenied, onFinishWrite]);

  useEffect(() => {
    active.current = true; panel.current?.focus();
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: decisionRef.current || writingRef.current || pendingWrite.current ? "block" : "allow" }));
    return () => { active.current = false; decisionRef.current = null; dataRef.current = undefined; unregister(); };
  }, []);
  useEffect(() => {
    void read();
    return () => { generation.current++; controller.current?.abort(); };
  }, [read]);

  const mutate = async (target: Decision) => {
    if (!active.current || busyRef.current || blockedRef.current || pendingWrite.current || dataRef.current !== target.page || generation.current !== target.epoch) return;
    const { item, page } = target;
    const record = onBeginWrite(projectId, page.expectedUpdatedAt);
    if (!record) return;
    pendingWrite.current = record;
    busyRef.current = true; writingRef.current = true; setBusy(true); setWriting(true); setNotice(undefined);
    const current = generation.current;
    let shouldRead = true;
    try { await setProjectRelation(projectId, page.kind, item.id, !item.linked, page.expectedUpdatedAt); }
    catch (error) {
      if (generation.current !== current) return;
      if (denied(error)) { shouldRead = false; onDenied(error); return; }
      const uncertain = !(error instanceof ApiRequestError) || error.retryable || error.status === 408 || error.status >= 500 || error.status === 409;
      if (error instanceof ApiRequestError && error.status === 409) setNotice(frontendText(locale, "PLANNING_VERSION_CONFLICT"));
      else if (uncertain) setNotice(frontendText(locale, "RELATIONS_UNKNOWN"));
      else {
        shouldRead = false;
        if (onFinishWrite(record)) pendingWrite.current = null;
        setNotice(frontendText(locale, "PROJECTS_ACTION_FAILED"));
      }
    } finally {
      if (generation.current === current) {
        if (shouldRead) await read();
        else { busyRef.current = false; setBusy(false); }
        if (active.current && !controller.current?.signal.aborted) { writingRef.current = false; setWriting(false); }
      }
    }
  };
  const change = (nextKind: ProjectRelationKind, next: FrontendPageRequest) => {
    if (!active.current || busyRef.current || decisionRef.current || pendingWrite.current || blockedRef.current) return;
    dataRef.current = undefined;
    busyRef.current = true; setBusy(true); setData(undefined); setNotice(undefined);
    setKind(nextKind); setRequest(next);
  };

  const requestMutation = (item: ProjectRelation, trigger?: HTMLButtonElement) => {
    const page = dataRef.current;
    if (!active.current || busyRef.current || blockedRef.current || pendingWrite.current || decisionRef.current || !page || !page.items.includes(item)) return;
    trigger?.focus();
    const next = { item, page, epoch: generation.current }; decisionRef.current = next; setDecision(next);
  };
  const cancel = () => {
    if (!active.current || !decision || decisionRef.current !== decision) return;
    decisionRef.current = null; setDecision(null);
  };
  const confirm = () => {
    if (!active.current || !decision || decisionRef.current !== decision) return;
    decisionRef.current = null; setDecision(null);
    void mutate(decision);
  };
  const close = () => {
    if (!active.current || writingRef.current || decisionRef.current) return;
    active.current = false; generation.current++; controller.current?.abort(); dataRef.current = undefined; onClose();
  };
  const locked = busy || !!decision;

  return <section id="project-relations-editor" data-project-relations-editor tabIndex={-1} ref={panel} aria-label={`${text("RELATIONS_TITLE")}: ${title}`} className="space-y-4 rounded-lg border p-4 focus-visible:ring-2 focus-visible:ring-ring">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{text("RELATIONS_TITLE")}: {title}</h2><Button type="button" variant="outline" disabled={writing || !!decision} onClick={close}>{text("RELATIONS_CLOSE")}</Button></div>
    <div className="flex gap-2">{(["goals", "tasks"] as const).map(value => <Button key={value} type="button" variant={kind === value ? "default" : "outline"} aria-pressed={kind === value} disabled={locked || !!pendingWrite.current || writeBlocked || value === kind} onClick={() => change(value, { page: 1, pageSize: request.pageSize })}>{text(value === "goals" ? "PROJECTS_GOALS" : "PROJECTS_TASKS")}</Button>)}</div>
    {notice && <p role="alert">{notice}</p>}
    {busy && <p role="status">{text("RELATIONS_LOADING")}</p>}
    {failed && <div role="alert"><p>{text("RELATIONS_FAILED")}</p><Button type="button" disabled={locked} onClick={() => { if (!busyRef.current && !decisionRef.current) void read(); }}>{text("RELATIONS_RETRY")}</Button></div>}
    {data && <><ul className="space-y-2">{data.items.map(item => <li key={item.id} className="flex items-center justify-between gap-3 rounded border p-3"><div className="min-w-0"><p className="break-words">{item.title}</p><p className="text-xs text-muted-foreground">{text(item.linked ? "RELATIONS_LINKED" : "RELATIONS_UNLINKED")}</p></div><Button type="button" variant="outline" disabled={locked || writeBlocked || !!pendingWrite.current} aria-label={`${text(item.linked ? "RELATIONS_UNLINK" : "RELATIONS_LINK")}: ${item.title}`} onClick={event => requestMutation(item, event?.currentTarget)}>{text(item.linked ? "RELATIONS_UNLINK" : "RELATIONS_LINK")}</Button></li>)}</ul>
      {!data.items.length && <p>{text("RELATIONS_EMPTY")}</p>}
      <DataPagination {...data.pagination} locale={locale} pending={locked || !!pendingWrite.current || writeBlocked} maxPage={Math.ceil(10_000 / request.pageSize)} onPageChange={page => change(kind, { ...request, page })} onPageSizeChange={pageSize => change(kind, { page: 1, pageSize })} />
    </>}
    <ConfirmAction open={!!decision} title={text("RELATIONS_CONFIRM_TITLE")}
      description={decision ? `${title} · ${text(decision.page.kind === "goals" ? "PROJECTS_GOALS" : "PROJECTS_TASKS")}: ${decision.item.title} · ${text(decision.item.linked ? "RELATIONS_LINKED" : "RELATIONS_UNLINKED")} → ${text(decision.item.linked ? "RELATIONS_UNLINKED" : "RELATIONS_LINKED")}. ${text(decision.item.linked ? "RELATIONS_UNLINK_IMPACT" : "RELATIONS_LINK_IMPACT")}` : ""}
      cancelLabel={text("COMMON_CANCEL")} confirmLabel={text(decision?.item.linked ? "RELATIONS_UNLINK" : "RELATIONS_LINK")}
      destructive={!!decision?.item.linked} onCancel={cancel} onConfirm={confirm} />
  </section>;
}
