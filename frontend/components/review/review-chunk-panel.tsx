import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { PageState } from "../ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ApiRequestError, type Fetcher } from "../../lib/api";
import {
  loadChunkRebuildReport,
  loadRevisionChunks,
  setChunkIndexStatus,
  type AdminChunk,
  type AdminChunkRebuildReport,
} from "../../lib/admin-chunk-data";

type ReportState = { kind: "loading" } | { kind: "ready"; value: AdminChunkRebuildReport } | { kind: "error"; message: string };
type ChunkState = { kind: "loading" } | { kind: "ready"; items: readonly AdminChunk[]; nextCursor: string | null } | { kind: "error"; message: string };

const CHUNK_PAGE_SIZE = 20;

function messageOf(error: unknown, fallbackKey: string, locale?: LocaleRuntime): string {
  return error instanceof ApiRequestError ? `${error.code}: ${error.message}` : frontendText(locale, fallbackKey);
}

/**
 * Chunk maintenance for one published revision.
 *
 * Read-only reporting: the rebuild report says whether the stored chunks still
 * match a rebuild of this revision, and the listing shows each stored chunk.
 * Mutating: the per-chunk control moves one chunk between searchable (`active`)
 * and excluded (`disabled`). Both halves are labelled so an administrator can
 * tell them apart before clicking.
 */
export function ReviewChunkPanel({ knowledgeItemId, revisionId, locale, requester = fetch }: {
  knowledgeItemId: string; revisionId: string; locale?: LocaleRuntime; requester?: Fetcher;
}) {
  const [report, setReport] = useState<ReportState>({ kind: "loading" });
  const [chunks, setChunks] = useState<ChunkState>({ kind: "loading" });
  const [pendingChunk, setPendingChunk] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>();
  const read = useRef<AbortController | null>(null);

  const loadFirstPage = useCallback((signal: AbortSignal) => {
    setChunks({ kind: "loading" });
    loadRevisionChunks({ knowledgeItemId, revisionId, limit: CHUNK_PAGE_SIZE, cursor: null, requester, signal })
      .then((page) => { if (!signal.aborted) setChunks({ kind: "ready", items: page.items, nextCursor: page.nextCursor }); })
      .catch((error: unknown) => { if (!signal.aborted) setChunks({ kind: "error", message: messageOf(error, "ADMIN_CHUNK_UNAVAILABLE", locale) }); });
  }, [knowledgeItemId, locale, requester, revisionId]);

  useEffect(() => {
    const controller = new AbortController();
    read.current = controller;
    setReport({ kind: "loading" });
    loadChunkRebuildReport({ knowledgeItemId, revisionId, requester, signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setReport({ kind: "ready", value }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setReport({ kind: "error", message: messageOf(error, "ADMIN_CHUNK_REPORT_UNAVAILABLE", locale) }); });
    loadFirstPage(controller.signal);
    return () => controller.abort();
  }, [knowledgeItemId, loadFirstPage, locale, requester, revisionId]);

  const loadMore = () => {
    if (chunks.kind !== "ready" || chunks.nextCursor === null) return;
    const controller = new AbortController();
    read.current = controller;
    loadRevisionChunks({ knowledgeItemId, revisionId, limit: CHUNK_PAGE_SIZE, cursor: chunks.nextCursor, requester, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setChunks((current) => current.kind === "ready"
          ? { kind: "ready", items: [...current.items, ...page.items], nextCursor: page.nextCursor }
          : current);
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setNotice(messageOf(error, "ADMIN_CHUNK_UNAVAILABLE", locale)); });
  };

  const setStatus = async (chunk: AdminChunk, status: "active" | "disabled") => {
    setPendingChunk(chunk.id);
    setNotice(undefined);
    try {
      const updated = await setChunkIndexStatus({ knowledgeItemId, revisionId, chunkId: chunk.id, status, requester });
      setChunks((current) => current.kind === "ready"
        ? { kind: "ready", items: current.items.map((item) => item.id === updated.id ? { ...item, status: updated.status } : item), nextCursor: current.nextCursor }
        : current);
      setPendingChunk(null);
    } catch (error) {
      setPendingChunk(null);
      setNotice(messageOf(error, "ADMIN_CHUNK_STATUS_FAILED", locale));
    }
  };

  return <div data-review-chunks={report.kind === "ready" ? "ready" : report.kind} className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium">{frontendText(locale, "ADMIN_CHUNK_TITLE")}</p>
      <p className="text-xs text-muted-foreground" data-review-chunk-revision={revisionId}>
        {frontendText(locale, "ADMIN_CHUNK_REVISION")}: {revisionId}
      </p>
    </div>
    <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_CHUNK_READ_ONLY_NOTE")}</p>
    {report.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : report.kind === "error" ? <p role="alert" className="text-sm text-destructive">{report.message}</p>
      : <div data-review-chunk-report={`${report.value.chunkCount}:${report.value.unchanged ? "unchanged" : "changed"}`} className="space-y-1 text-sm">
        <p>{frontendText(locale, "ADMIN_CHUNK_REPORT_COUNT")}: <span data-review-chunk-count={report.value.chunkCount}>{report.value.chunkCount}</span></p>
        <p data-review-chunk-unchanged={report.value.unchanged ? "yes" : "no"}>
          {frontendText(locale, report.value.unchanged ? "ADMIN_CHUNK_REPORT_UNCHANGED" : "ADMIN_CHUNK_REPORT_CHANGED")}
        </p>
        <p>{frontendText(locale, "ADMIN_CHUNK_REPORT_MAPPINGS")}: <span data-review-chunk-mappings={report.value.mappings.length}>{report.value.mappings.length}</span></p>
      </div>}

    {chunks.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : chunks.kind === "error" ? <p role="alert" className="text-sm text-destructive">{chunks.message}</p>
      : <>
        <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_CHUNK_MUTATION_NOTE")}</p>
        {chunks.items.length === 0 && chunks.nextCursor === null ? <PageState kind="empty" title={frontendText(locale, "ADMIN_CHUNK_EMPTY")} /> : <ul className="divide-y rounded-md border">
          {chunks.items.map((chunk) => <li key={chunk.id} data-review-chunk={chunk.id} className="space-y-2 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Badge variant="outline" data-review-chunk-ordinal={chunk.ordinal}>#{chunk.ordinal}</Badge>
                <span className="truncate">{chunk.headingPath.length > 0 ? chunk.headingPath.join(" / ") : frontendText(locale, "ADMIN_CHUNK_NO_HEADING")}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={chunk.status === "active" ? "outline" : "warning"} data-review-chunk-status={chunk.status}>{chunk.status}</Badge>
                <Button type="button" size="sm" variant="outline" disabled={pendingChunk !== null}
                  data-review-chunk-toggle={`${chunk.id}:${chunk.status === "active" ? "disable" : "enable"}`}
                  onClick={() => void setStatus(chunk, chunk.status === "active" ? "disabled" : "active")}>
                  {frontendText(locale, chunk.status === "active" ? "ADMIN_CHUNK_DISABLE" : "ADMIN_CHUNK_ENABLE")}
                </Button>
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_CHUNK_LINES")} {chunk.startLine}–{chunk.endLine} · {frontendText(locale, "ADMIN_CHUNK_TOKENS")} {chunk.tokenEstimate}</p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs leading-6">{chunk.body}</pre>
          </li>)}
        </ul>}
        {chunks.nextCursor !== null && <Button type="button" variant="outline" data-review-chunk-more onClick={loadMore}>
          {frontendText(locale, "ADMIN_CHUNK_LOAD_MORE")}
        </Button>}
      </>}
    {notice && <p role="alert" className="text-sm text-destructive">{notice}</p>}
  </div>;
}
