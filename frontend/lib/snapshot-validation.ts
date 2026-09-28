import { canonicalInstant } from "./calendar-query";
import type { InboxItem } from "./inbox-data";
import type { Project } from "./projects-data";
import type { TaskItem } from "./tasks-data";

/** Shared strict shapes for bounded, member-private aggregate receipts. */
export function snapshotValidation(errorCode: string) {
  function normalizeTask(value: unknown): TaskItem {
    const r = object(value);
    if (typeof r.status !== "string" || !["todo", "doing", "blocked", "done", "canceled"].includes(r.status) || typeof r.priority !== "string" || !["low", "medium", "high"].includes(r.priority)) invalid();
    return { id: id(r.id), title: text(r.title, true), notes: text(r.notes), status: r.status as TaskItem["status"], priority: r.priority as TaskItem["priority"], progress: progress(r.progress), dueAt: optionalDate(r.dueAt), completedAt: optionalDate(r.completedAt), createdAt: date(r.createdAt), updatedAt: date(r.updatedAt) };
  }
  function normalizeInbox(value: unknown): InboxItem {
    const r = object(value);
    if (r.kind !== "text" && r.kind !== "link" && r.kind !== "file_ref") invalid();
    if (r.status !== "inbox") invalid();
    return { id: id(r.id), clientKey: id(r.clientKey), kind: r.kind, content: text(r.content, true), sourceUrl: r.sourceUrl === null ? null : text(r.sourceUrl), status: "inbox", promotedTaskId: optionalId(r.promotedTaskId), promotedSubmissionId: optionalId(r.promotedSubmissionId), createdAt: date(r.createdAt), updatedAt: date(r.updatedAt) };
  }
  function normalizeProject(value: unknown): Project {
    const r = object(value);
    if (r.status !== "active") invalid();
    return { id: id(r.id), clientKey: id(r.clientKey), title: text(r.title, true), description: r.description === null ? null : text(r.description), status: "active", progress: progress(r.progress), targetAt: optionalDate(r.targetAt), createdAt: date(r.createdAt), updatedAt: date(r.updatedAt) };
  }
  function rows<T extends {id: string}>(value: unknown, limit: number, parse: (value: unknown) => T): T[] {
    if (!Array.isArray(value) || value.length > limit) invalid();
    const result = value.map(parse); unique(result); return result;
  }
  function unique(rows: {id: string}[]) { if (new Set(rows.map(row => row.id)).size !== rows.length) invalid(); }
  function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) invalid(); return value as Record<string, unknown>; }
  function text(value: unknown, nonempty = false): string { if (typeof value !== "string" || (nonempty && !value.trim())) invalid(); return value; }
  function id(value: unknown): string { const result = text(value, true); if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(result)) invalid(); return result; }
  function optionalId(value: unknown): string | null { return value === null ? null : id(value); }
  function date(value: unknown): string { if (!canonicalInstant(value)) invalid(); return value; }
  function optionalDate(value: unknown): string | null { return value === null ? null : date(value); }
  function count(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(); return value; }
  function progress(value: unknown): number { const result = count(value); if (result > 100) invalid(); return result; }
  function invalid(): never { throw new Error(errorCode); }

  return {normalizeTask, normalizeInbox, normalizeProject, rows, unique, object, text, id, date, count, invalid};
}
