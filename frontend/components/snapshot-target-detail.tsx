import { loadInboxItem } from "../lib/inbox-data";
import { loadProject } from "../lib/projects-data";
import { useEffect, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { loadCalendarEvent } from "../lib/calendar-data";
import { loadTaskDetail } from "../lib/tasks-data";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { PageState } from "./ui/page-state";
export type SnapshotTarget = { kind: "task" | "calendar" | "inbox" | "project"; id: string };
type DetailState = {kind: "loading"} | {kind: "error"} | {kind: "ready"; title: string; description: string; status: string; time: string | null};

/** Snapshot titles are never used as an authorization receipt for target details. */
export function SnapshotTargetDetail({ target, locale, onClose, onDenied, title }: { target: SnapshotTarget; title?: string; locale: LocaleRuntime; onClose: () => void; onDenied: () => void }) {
  const [state, setState] = useState<DetailState>({kind: "loading"});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({kind: "loading"});
    const read = async (): Promise<DetailState> => {
      if (target.kind === "task") {
        const {task} = await loadTaskDetail(target.id, fetch, controller.signal);
        return {kind: "ready", title: task.title, description: task.notes, status: task.status, time: task.dueAt};
      }
      if (target.kind === "inbox") {
        const item = await loadInboxItem(target.id, fetch, controller.signal);
        return {kind: "ready", title: item.content, description: "", status: item.status, time: item.updatedAt};
      }
      if (target.kind === "project") {
        const item = await loadProject(target.id, fetch, controller.signal);
        return {kind: "ready", title: item.title, description: item.description ?? "", status: item.status, time: item.targetAt};
      }
      const event = await loadCalendarEvent(target.id, fetch, controller.signal);
      const format = new Intl.DateTimeFormat(locale.locale, {dateStyle: "medium", timeStyle: "short", timeZone: event.timezone});
      return {kind: "ready", title: event.title, description: event.description, status: event.status, time: `${format.format(new Date(event.startsAt))} – ${format.format(new Date(event.endsAt))} (${event.timezone})`};
    };
    void read().then(result => {if (active) setState(result);}).catch((error: unknown) => {
      if (!active || controller.signal.aborted) return;
      setState({kind: "error"});
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) onDenied();
    });
    return () => { active = false; controller.abort(); };
  }, [target.kind, target.id, locale, retry, onDenied]);
  return <Dialog open onOpenChange={open => {if (!open) onClose();}}><DialogContent aria-labelledby="snapshot-detail-title" className="max-h-[85vh] overflow-y-auto space-y-3">
    <DialogTitle id="snapshot-detail-title">{title ?? frontendText(locale, "TODAY_DETAIL_TITLE")}</DialogTitle>
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "TODAY_LOADING")} /> : state.kind === "error" ? <PageState kind="error" title={frontendText(locale, "COMMON_UNABLE_TO_LOAD")}><Button onClick={() => setRetry(value => value + 1)}>{frontendText(locale, "TODAY_DETAIL_RETRY")}</Button></PageState> : <div className="space-y-2"><h3 className="font-medium break-words">{state.title}</h3><p>{state.status}</p>{state.time && <p>{state.time}</p>}<p className="whitespace-pre-wrap break-words">{state.description}</p></div>}
    <Button variant="outline" onClick={onClose}>{frontendText(locale, "TODAY_DETAIL_CLOSE")}</Button>
  </DialogContent></Dialog>;
}
