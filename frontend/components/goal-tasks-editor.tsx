import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { FrontendPageRequest } from "../lib/numbered-page";
import { loadGoalTasks, setGoalTask, type GoalTask, type GoalTaskPage } from "../lib/goal-tasks-data";
import type { PlanningWriteRecord } from "../lib/planning-write-recovery";
import { DataPagination } from "./data-pagination";
import { Button } from "./ui/button";
import { ConfirmAction } from "./ui/confirm-action";
import { registerWorkspaceLeaveGuard } from "../lib/workspace-location";
interface Props {
  goalId: string; title: string; locale: LocaleRuntime;
  onDenied: (error: unknown) => boolean; onReadFailure: () => void; onClose: () => void;
  onBeginWrite: (id: string, version: string) => PlanningWriteRecord | null;
  onFinishWrite: (record: PlanningWriteRecord) => boolean; writeBlocked: boolean;
}
export function GoalTasksEditor({ goalId, title, locale, onDenied, onReadFailure, onClose, onBeginWrite, onFinishWrite, writeBlocked }: Props) {
  type Decision = { item: GoalTask; page: GoalTaskPage; epoch: number };
  const [decision, setDecision] = useState<Decision | null>(null);
  const decisionRef = useRef<Decision | null>(null);
  const dataRef = useRef<GoalTaskPage | undefined>(undefined);
  const active = useRef(true), writingRef = useRef(false);
  const blockedRef = useRef(writeBlocked); blockedRef.current = writeBlocked;
  const text = (key: string) => frontendText(locale, key);
  const [request, setRequest] = useState<FrontendPageRequest>({ page: 1, pageSize: 20 });
  const [data, setData] = useState<GoalTaskPage>();
  const [busy, setBusy] = useState(true), [writing, setWriting] = useState(false), [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string>();
  const busyRef = useRef(true), generation = useRef(0), controller = useRef<AbortController | null>(null);
  const pendingWrite = useRef<PlanningWriteRecord | null>(null), minimumVersion = useRef<string | undefined>(undefined);
  const panel = useRef<HTMLElement>(null);
  const read = useCallback(async () => {
    if (!active.current || decisionRef.current) return;
    dataRef.current = undefined;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; const current = ++generation.current;
    busyRef.current = true; setBusy(true); setData(undefined); setFailed(false);
    try {
      const page = await loadGoalTasks(goalId, request, fetch, abort.signal);
      if (generation.current !== current || abort.signal.aborted) return;
      const minimum = minimumVersion.current ?? pendingWrite.current?.expectedUpdatedAt;
      if (minimum && Date.parse(page.expectedUpdatedAt) < Date.parse(minimum)) throw new Error("GOAL_TASK_VERSION_REGRESSED");
      dataRef.current = page; setData(page);
      // A read releases the barrier, not proof that an unknown write succeeded.
      const record = pendingWrite.current;
      if (record && onFinishWrite(record)) { pendingWrite.current = null; minimumVersion.current = undefined; }
    } catch (error) {
      if (generation.current !== current || abort.signal.aborted) return;
      if (onDenied(error)) return;
      setFailed(true); onReadFailure();
    } finally { if (generation.current === current && !abort.signal.aborted) { busyRef.current = false; setBusy(false); } }
  }, [goalId, request, onDenied, onReadFailure, onFinishWrite]);
  useEffect(() => {
    active.current = true; panel.current?.focus();
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: decisionRef.current || writingRef.current || pendingWrite.current ? "block" : "allow" }));
    return () => { active.current = false; decisionRef.current = null; dataRef.current = undefined; unregister(); };
  }, []);
  useEffect(() => { void read(); return () => { generation.current++; controller.current?.abort(); }; }, [read]);
  const mutate = async (target: Decision) => {
    if (!active.current || busyRef.current || blockedRef.current || pendingWrite.current || dataRef.current !== target.page || generation.current !== target.epoch) return;
    const { item, page } = target;
    const record = onBeginWrite(goalId, page.expectedUpdatedAt); if (!record) return;
    pendingWrite.current = record; busyRef.current = true; writingRef.current = true; setBusy(true); setWriting(true); setNotice(undefined);
    const current = generation.current; let shouldRead = true;
    try {
      const version = await setGoalTask(goalId, item.id, !item.linked, page.expectedUpdatedAt);
      if (generation.current !== current) return;
      minimumVersion.current = version;
    } catch (error) {
      if (generation.current !== current) return;
      if (onDenied(error)) { shouldRead = false; return; }
      const unknown = !(error instanceof ApiRequestError) || error.retryable || error.status === 408 || error.status >= 500 || error.status === 409;
      if (error instanceof ApiRequestError && error.status === 409) setNotice(frontendText(locale, "PLANNING_VERSION_CONFLICT"));
      else if (unknown) setNotice(frontendText(locale, "RELATIONS_UNKNOWN"));
      else { shouldRead = false; if (onFinishWrite(record)) pendingWrite.current = null; setNotice(frontendText(locale, "GOALS_ACTION_FAILED")); }
    } finally {
      if (generation.current === current) {
        if (shouldRead) await read(); else { busyRef.current = false; setBusy(false); }
        if (active.current && !controller.current?.signal.aborted) { writingRef.current = false; setWriting(false); }
      }
    }
  };
  const change = (next: FrontendPageRequest) => { if (!active.current || busyRef.current || decisionRef.current || pendingWrite.current || blockedRef.current) return; dataRef.current = undefined; busyRef.current = true; setBusy(true); setData(undefined); setNotice(undefined); setRequest(next); };
  const requestMutation = (item: GoalTask, trigger?: HTMLButtonElement) => {
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
    decisionRef.current = null; setDecision(null); void mutate(decision);
  };
  const close = () => {
    if (!active.current || writingRef.current || decisionRef.current) return;
    active.current = false; generation.current++; controller.current?.abort(); dataRef.current = undefined; onClose();
  };
  const locked = busy || !!decision;
  return <section data-goal-tasks-editor tabIndex={-1} ref={panel} aria-label={frontendText(locale, "GOALS_TASK_LINKS")} className="space-y-4 rounded-lg border p-4 focus-visible:ring-2 focus-visible:ring-ring">
    <div className="flex items-center justify-between"><h2 className="font-semibold">{frontendText(locale, "GOALS_TASK_LINKS")}</h2><Button type="button" variant="outline" disabled={writing || !!decision} onClick={close}>{frontendText(locale, "RELATIONS_CLOSE")}</Button></div>
    {notice && <p role="alert">{notice}</p>}
    {busy && <p role="status">{frontendText(locale, "RELATIONS_LOADING")}</p>}
    {failed && <div role="alert"><p>{frontendText(locale, "RELATIONS_FAILED")}</p><Button type="button" disabled={locked} onClick={() => { if (!busyRef.current && !decisionRef.current) void read(); }}>{frontendText(locale, "RELATIONS_RETRY")}</Button></div>}
    {data && <><p>{frontendText(locale, "GOALS_TASK_COUNTS")}: {data.summary.completedTaskCount}/{data.summary.taskCount}</p><p className="text-sm text-muted-foreground">{frontendText(locale, "GOALS_TASK_PROGRESS_NOTE")}</p>
      <ul className="space-y-2">{data.items.map(item => <li key={item.id} className="flex items-center justify-between gap-3 rounded border p-3"><p className="break-words">{item.title}</p><Button type="button" variant="outline" disabled={locked || writeBlocked || !!pendingWrite.current} aria-label={`${frontendText(locale, item.linked ? "RELATIONS_UNLINK" : "RELATIONS_LINK")}: ${item.title}`} onClick={event => requestMutation(item, event?.currentTarget)}>{frontendText(locale, item.linked ? "RELATIONS_UNLINK" : "RELATIONS_LINK")}</Button></li>)}</ul>
      {!data.items.length && <p>{frontendText(locale, "RELATIONS_EMPTY")}</p>}
      <DataPagination {...data.pagination} locale={locale} pending={locked || !!pendingWrite.current || writeBlocked} maxPage={Math.ceil(10000 / request.pageSize)} onPageChange={page => change({ ...request, page })} onPageSizeChange={pageSize => change({ page: 1, pageSize })} />
    </>}
    <ConfirmAction open={!!decision} title={text("GOALS_TASK_CONFIRM_TITLE")}
      description={decision ? `${title} · ${decision.item.title} · ${text(decision.item.linked ? "RELATIONS_LINKED" : "RELATIONS_UNLINKED")} → ${text(decision.item.linked ? "RELATIONS_UNLINKED" : "RELATIONS_LINKED")}. ${text(decision.item.linked ? "GOALS_TASK_UNLINK_IMPACT" : "GOALS_TASK_LINK_IMPACT")}` : ""}
      cancelLabel={text("COMMON_CANCEL")} confirmLabel={text(decision?.item.linked ? "RELATIONS_UNLINK" : "RELATIONS_LINK")}
      destructive={!!decision?.item.linked} onCancel={cancel} onConfirm={confirm} />
  </section>;
}
