import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { beginPlanningWrite, canonicalPlanningVersion, clearPlanningWrite, loadPlanningWrite, type PlanningWriteRecord, type PlanningWriteState, type PlanningWriteModule } from "../lib/planning-write-recovery";
import { loadGoal } from "../lib/goals-data";
import { loadProject, loadProjectTimelineItem } from "../lib/projects-data";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { Button } from "./ui/button";

export function usePlanningWriteRecovery(memberId: string | undefined, module: PlanningWriteModule, locationKey: string) {
  const [state, setState] = useState<PlanningWriteState>(() => memberId ? loadPlanningWrite(memberId, module) : { kind: "empty" });
  const current = useRef(state);
  const active = useRef(true);
  const generation = useRef(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const busy = useRef(false);
  const [reading, setReading] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [failed, setFailed] = useState(false);
  const update = useCallback((next: PlanningWriteState) => { current.current = next; setState(next); }, []);
  useEffect(() => {
    active.current = true; busy.current = false; setReading(false);
    return () => { active.current = false; generation.current++; controller.current?.abort(); };
  }, [locationKey]);
  const begin = useCallback((id: string, expectedUpdatedAt: string) => {
    if (current.current.kind !== "empty" || busy.current) return null;
    const record = Object.freeze({ token: crypto.randomUUID(), id, expectedUpdatedAt });
    if (memberId && !beginPlanningWrite(memberId, module, record)) { update({ kind: "blocked" }); return null; }
    update({ kind: "ready", record }); setReviewed(false); setFailed(false); return record;
  }, [memberId, module, update]);
  const finish = useCallback((record: PlanningWriteRecord) => {
    if (!active.current || current.current.kind !== "ready" || current.current.record.token !== record.token) return false;
    if (memberId && !clearPlanningWrite(memberId, module, record)) { update({ kind: "blocked" }); return false; }
    update({ kind: "empty" }); return true;
  }, [memberId, module, update]);
  const deny = useCallback(() => {
    generation.current++; controller.current?.abort(); busy.current = false; setReading(false); setReviewed(false);
    if (memberId) {
      const stored = loadPlanningWrite(memberId, module);
      if (stored.kind === "ready") clearPlanningWrite(memberId, module, stored.record);
    }
    update({ kind: "empty" });
  }, [memberId, module, update]);
  const recover = async (refresh: () => Promise<boolean>, onDenied: (error: unknown) => boolean) => {
    if (busy.current || !active.current) return;
    const stored = memberId ? loadPlanningWrite(memberId, module) : current.current;
    update(stored); setFailed(false);
    if (stored.kind !== "ready") return;
    busy.current = true; setReading(true);
    const epoch = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    const live = () => active.current && generation.current === epoch && !abort.signal.aborted;
    try {
      const item = module.startsWith("TIMELINE:") ? await loadProjectTimelineItem(module.slice(9), stored.record.id, fetch, abort.signal) : module === "GOALS" ? await loadGoal(stored.record.id, fetch, abort.signal) : await loadProject(stored.record.id, fetch, abort.signal);
      if (!live()) return;
      if (!canonicalPlanningVersion(item.updatedAt) || Date.parse(item.updatedAt) < Date.parse(stored.record.expectedUpdatedAt)) throw new Error("PLANNING_RECOVERY_VERSION_INVALID");
      const read = await refresh();
      if (!live()) return;
      if (read && finish(stored.record)) setReviewed(true);
      else setFailed(true);
    } catch (error) {
      if (!live()) return;
      if (error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) { onDenied(error); return; }
      setFailed(true);
    } finally { if (live()) { busy.current = false; setReading(false); } }
  };
  return { locked: state.kind !== "empty", blocked: state.kind === "blocked", reading, reviewed, failed, begin, finish, deny, recover };
}
export function PlanningWriteRecovery({ recovery, locale, pending, refresh, onDenied }: {
  recovery: ReturnType<typeof usePlanningWriteRecovery>; locale: LocaleRuntime; pending: boolean;
  refresh: () => Promise<boolean>; onDenied: (error: unknown) => boolean;
}) {
  if (!recovery.locked) return recovery.reviewed ? <p role="status">{frontendText(locale, "PLANNING_WRITE_REVIEWED")}</p> : null;
  return <div role="alert" className="space-y-2 rounded-lg border p-4">
    <p>{frontendText(locale, recovery.blocked ? "PLANNING_WRITE_STORAGE_BLOCKED" : "PLANNING_WRITE_UNKNOWN")}</p>
    {recovery.failed && <p>{frontendText(locale, "PLANNING_WRITE_READ_FAILED")}</p>}
    <Button type="button" data-planning-write-recover disabled={pending || recovery.reading} onClick={() => void recovery.recover(refresh, onDenied)}>{frontendText(locale, "PLANNING_WRITE_RECOVER")}</Button>
  </div>;
}
