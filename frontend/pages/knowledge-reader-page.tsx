import { useEffect, useRef, useState, type ReactNode } from "react";
import { LinkSimpleIcon, ListBulletsIcon } from "@phosphor-icons/react";
import { ExpandableTabs } from "../components/ui/expandable-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PageHeader } from "../components/ui/page-header";
import { PageState } from "../components/ui/page-state";
import { Button } from "../components/ui/button";
import { CodeBlock } from "../components/agents/code-block";
import { KnowledgeDerivativesPanel } from "../components/knowledge/knowledge-derivatives-panel";
import { KnowledgeResearchRunPanel, type DraftableReport } from "../components/knowledge/knowledge-research-panel";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { defaultSubmissionTarget } from "../lib/submission-data";
import { useKnowledgeDerivatives, useItemResearchRuns } from "../lib/use-knowledge-derivatives";
import { useReaderNoteShares } from "../lib/use-reader-note-shares";
import type { KnowledgeBacklinkItem, KnowledgeRevision, KnowledgeRevisionDiff, KnowledgeSourceLocation, RelatedKnowledgeItem } from "../lib/knowledge-reader-data";
import type { FavoriteWritePhase } from "../lib/reader-favorite-intent";
import { useReaderNote } from "../lib/use-reader-note";
import { contextDiscussionHref } from "./messages/discussion-model";

export type KnowledgeReaderState = { kind: "loading" } | { kind: "ready" } | { kind: "forbidden" } | { kind: "error"; message: string };

type DiffState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; diff: KnowledgeRevisionDiff } | { kind: "error" };
type RelatedState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; items: readonly RelatedKnowledgeItem[] } | { kind: "error" };
type BacklinkState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; items: readonly KnowledgeBacklinkItem[] } | { kind: "error" };
type KnowledgeReaderRevisionInput = Pick<KnowledgeRevision, "id" | "markdown"> & Partial<KnowledgeRevision>;

/**
 * The citation window the generators accept (1–8 ids of this item). The chunk
 * the reader has selected leads, so "generate from what I am looking at" and
 * "generate from the revision" are the same request shape. A revision whose
 * chunks carry no citation id yields no window at all, and the panel says so
 * instead of sending something the server would have to refuse.
 */
function derivativeSources(revision: KnowledgeRevision, selectedChunkId: string | null): string[] {
  const available = revision.chunks.flatMap((chunk) => chunk.citationId ? [chunk.citationId] : []);
  const selected = revision.chunks.find((chunk) => chunk.id === selectedChunkId)?.citationId;
  const ordered = selected ? [selected, ...available.filter((id) => id !== selected)] : available;
  return [...new Set(ordered)];
}

export function KnowledgeReaderPage(props: Parameters<typeof KnowledgeReaderSessionPage>[0]) {
  return <KnowledgeReaderSessionPage key={`${props.memberId ?? ""}:${props.revision.knowledgeItemId ?? ""}`} {...props} />;
}

function KnowledgeReaderSessionPage({ memberId = "", revision, renderMarkdown, locale, canCreateSubmission = false, state = { kind: "ready" }, onRetry, diffState = { kind: "idle" }, onCompare, relatedState = { kind: "idle" }, onRetryRelated, backlinkState = { kind: "idle" }, onRetryBacklinks, favorite, favoriteError = false, favoritePhase = "idle", onCheckFavorite, onToggleFavorite }: { memberId?: string; revision: KnowledgeReaderRevisionInput; renderMarkdown: (markdown: string) => ReactNode; locale?: LocaleRuntime; canCreateSubmission?: boolean; state?: KnowledgeReaderState; onRetry?: () => void; diffState?: DiffState; onCompare?: () => void; relatedState?: RelatedState; onRetryRelated?: () => void; backlinkState?: BacklinkState; onRetryBacklinks?: () => void; favorite?: boolean | null; favoriteError?: boolean; favoritePhase?: FavoriteWritePhase; onCheckFavorite?: () => void | Promise<void>; onToggleFavorite?: () => void | Promise<void> }) {
  const normalizedRevision: KnowledgeRevision = {
    id: revision.id,
    knowledgeItemId: revision.knowledgeItemId ?? "",
    title: revision.title,
    markdown: revision.markdown,
    publishedAt: revision.publishedAt,
    isCurrent: revision.isCurrent === true,
    previousRevisionId: revision.previousRevisionId ?? null,
    sourceVersionId: revision.sourceVersionId ?? "",
    sourceVersionOrdinal: revision.sourceVersionOrdinal ?? null,
    parserSchemaVersion: revision.parserSchemaVersion ?? null,
    indexStatus: revision.indexStatus ?? "pending",
    visibility: revision.visibility,
    chunks: Array.isArray(revision.chunks) ? revision.chunks : [],
  };
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(revision.selectedChunkId ?? null);
  const [mobilePanel, setMobilePanel] = useState<"outline" | "sources" | null>(revision.selectedChunkId ? "sources" : null);
  useEffect(() => {
    setSelectedChunkId(revision.selectedChunkId ?? null);
    setMobilePanel(revision.selectedChunkId ? "sources" : null);
  }, [revision.id, revision.selectedChunkId]);
  const sharingBlock = useRef<() => boolean>(() => false);
  const note = useReaderNote(memberId, normalizedRevision.knowledgeItemId, locale, () => sharingBlock.current());
  const sharing = useReaderNoteShares(memberId, normalizedRevision.knowledgeItemId, note, locale);
  sharingBlock.current = sharing.isBlocking;
  const selectedChunk = normalizedRevision.chunks.find((chunk) => chunk.id === selectedChunkId);
  // The reader's generation surface is bound to the item and the revision it was
  // opened on, never to whatever request happens to settle first.
  const derivatives = useKnowledgeDerivatives({
    knowledgeItemId: normalizedRevision.knowledgeItemId,
    revisionId: normalizedRevision.id,
    citationIds: derivativeSources(normalizedRevision, selectedChunkId),
  });
  const research = useItemResearchRuns({ memberId, knowledgeItemId: normalizedRevision.knowledgeItemId, canCreateSubmission });
  const reportState = derivatives.stateFor("report");
  const draftableReport: DraftableReport | null = reportState.kind === "ready"
    && reportState.artifact.kind === "report" && reportState.artifact.reportId
    ? { runId: reportState.artifact.researchRunId, reportId: reportState.artifact.reportId, title: reportState.artifact.title }
    : null;
  // The entry's own title only exists once the revision has loaded: showing the untitled
  // fallback (or any other real-looking title) before that would both mislead the reader
  // and make "untitled" indistinguishable from "not loaded yet".
  const headerTitle = state.kind === "ready"
    ? (normalizedRevision.title?.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED"))
    : state.kind === "loading" ? frontendText(locale, "KNOWLEDGE_READER_LOADING") : frontendText(locale, "COMMON_VALUE_UNAVAILABLE");
  const headerDescription = state.kind === "ready" ? normalizedRevision.publishedAt || (normalizedRevision.sourceVersionOrdinal === null ? undefined : `${frontendText(locale, "KNOWLEDGE_READER_SOURCE_VERSION")} #${normalizedRevision.sourceVersionOrdinal}`) : undefined;
  const headerStatus = state.kind === "ready" && normalizedRevision.isCurrent === false ? frontendText(locale, "KNOWLEDGE_READER_HISTORICAL") : undefined;
  const saveNote = () => {
    const citationChunk = selectedChunk ?? normalizedRevision.chunks[0];
    const citations = citationChunk ? [{ revisionId: normalizedRevision.id, chunkId: citationChunk.id, startLine: citationChunk.startLine, endLine: citationChunk.endLine }] : [];
    void note.save(citations);
  };
  return <div className="space-y-5">
    {/* A revoked read leaves no private note/share decision mounted: the confirmation
        dialogue names a recipient, so it only exists while the reader is authorized. */}
    {state.kind === "ready" && <>{note.draft.confirmation}{sharing.confirmation}</>}
    <PageHeader
      title={headerTitle}
      description={headerDescription}
      status={headerStatus}
      actions={<>{favoritePhase === "unknown" && <p role="alert" className="text-xs text-destructive">{frontendText(locale, "KNOWLEDGE_READER_FAVORITE_UNCONFIRMED")}</p>}{favoritePhase === "blocked" && <p role="alert" className="text-xs text-destructive">{frontendText(locale, "KNOWLEDGE_READER_FAVORITE_STORAGE")}</p>}{(favoriteError || favoritePhase === "unknown" || favoritePhase === "blocked" || favoritePhase === "checking") && onCheckFavorite && <Button size="sm" variant="outline" disabled={favoritePhase === "checking" || favoritePhase === "saving"} onClick={() => void onCheckFavorite()}>{frontendText(locale, "KNOWLEDGE_READER_FAVORITE_CHECK")}</Button>}{favoriteError && <p role="alert" className="text-xs text-destructive">{frontendText(locale, "KNOWLEDGE_READER_FAVORITE_UNKNOWN")}</p>}{typeof favorite === "boolean" && !favoriteError && (favoritePhase === "idle" || favoritePhase === "saving") && onToggleFavorite && <Button disabled={favoritePhase !== "idle"} aria-busy={favoritePhase === "saving"} size="sm" variant={favorite ? "default" : "outline"} onClick={() => void onToggleFavorite()} aria-pressed={favorite}>{favorite ? frontendText(locale, "KNOWLEDGE_READER_UNFAVORITE") : frontendText(locale, "KNOWLEDGE_READER_FAVORITE")}</Button>}{normalizedRevision.previousRevisionId && onCompare && <Button size="sm" variant="outline" disabled={diffState.kind === "loading"} onClick={onCompare}>{diffState.kind === "loading" ? frontendText(locale, "KNOWLEDGE_READER_COMPARING") : frontendText(locale, "KNOWLEDGE_READER_COMPARE")}</Button>}{normalizedRevision.knowledgeItemId && <a href={contextDiscussionHref({ kind: "knowledge", id: normalizedRevision.knowledgeItemId })} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition hover:bg-accent">{frontendText(locale, "MESSAGES_DISCUSS")}</a>}<a href={"/agent?scope=items&knowledgeItemId=" + encodeURIComponent(normalizedRevision.knowledgeItemId)} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition hover:bg-accent">{frontendText(locale, "KNOWLEDGE_READER_ASK")}</a></>}
    />
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "KNOWLEDGE_READER_LOADING")} />
      : state.kind === "error" ? <PageState kind="error" title={state.message || frontendText(locale, "KNOWLEDGE_READER_ERROR")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></PageState>
        : state.kind === "forbidden" ? <PageState kind="forbidden" title={frontendText(locale, "KNOWLEDGE_READER_REVOKED")} description={frontendText(locale, "KNOWLEDGE_READER_REVOKED_DESCRIPTION")}>
          <Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>
        </PageState>
        : <article data-reader-layout className="space-y-5">
    <ExpandableTabs className="lg:hidden" ariaLabel={frontendText(locale, "KNOWLEDGE_READER_MOBILE_PANELS")} value={mobilePanel} onValueChange={setMobilePanel} items={[
      { id: "outline", label: frontendText(locale, "KNOWLEDGE_READER_TAB_OUTLINE"), controls: "reader-outline-panel", icon: <ListBulletsIcon size={16} aria-hidden="true" /> },
      { id: "sources", label: frontendText(locale, "KNOWLEDGE_READER_TAB_SOURCES"), controls: "reader-sources-panel", icon: <LinkSimpleIcon size={16} aria-hidden="true" /> },
    ]} />
    <div className="grid gap-5 lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_minmax(17rem,22rem)] lg:items-start">
      <aside id="reader-outline-panel" data-reader-outline className={(mobilePanel === "outline" ? "block" : "hidden") + " lg:sticky lg:top-6 lg:block lg:self-start"}>
        <ReaderOutlinePanel locale={locale} revision={normalizedRevision} selectedChunkId={selectedChunkId} onSelectChunk={setSelectedChunkId} />
      </aside>
      <main className="min-w-0 space-y-5">
        <Card><CardContent><div className="prose prose-slate max-w-none text-sm leading-7">{renderMarkdown(normalizedRevision.markdown)}</div></CardContent></Card>
        <KnowledgeDerivativesPanel
          locale={locale}
          knowledgeItemId={normalizedRevision.knowledgeItemId}
          derivatives={derivatives}
          runningRunId={research.runningRunId}
          renderMarkdown={renderMarkdown}
        />
        <KnowledgeResearchRunPanel
          locale={locale}
          knowledgeItemId={normalizedRevision.knowledgeItemId}
          research={research}
          canCreateSubmission={canCreateSubmission}
          report={draftableReport}
          draftTarget={defaultSubmissionTarget}
        />
        {diffState.kind !== "idle" && <RevisionDiffPanel locale={locale} state={diffState} />}
      </main>
      <aside id="reader-sources-panel" data-reader-sources className={(mobilePanel === "sources" ? "block" : "hidden") + " space-y-5 lg:block"}>
        <SourcePanel locale={locale} revision={normalizedRevision} selectedChunkId={selectedChunkId} selectedChunk={selectedChunk} onSelectChunk={setSelectedChunkId} />
        <ReaderNotePanel discardError={note.discardError} sharing={sharing} locale={locale} knowledgeItemId={normalizedRevision.knowledgeItemId} access={note.access} title={note.draft.fields.title} body={note.draft.fields.body} status={note.status} onTitleChange={(value) => note.edit("title", value)} onBodyChange={(value) => note.edit("body", value)} onSave={saveNote} locked={note.locked || sharing.isBlocking()} phase={note.phase} onCheck={() => void note.check()} onRetryLoad={note.retryLoad} />
        {backlinkState.kind !== "idle" && <BacklinkPanel locale={locale} state={backlinkState} onRetry={onRetryBacklinks} />}
        {relatedState.kind !== "idle" && <RelatedKnowledgePanel locale={locale} state={relatedState} onRetry={onRetryRelated} />}
      </aside>
    </div>
  </article>}
  </div>
}

function ReaderNotePanel({ discardError, sharing, locale, knowledgeItemId, access, title, body, status, onTitleChange, onBodyChange, onSave, locked, phase, onCheck, onRetryLoad }: { discardError: boolean; sharing: ReturnType<typeof useReaderNoteShares>; locked: boolean; phase: string; onCheck: () => void; onRetryLoad: () => void; locale?: LocaleRuntime; knowledgeItemId: string; access: "owner" | "shared"; title: string; body: string; status: "idle" | "saved" | "saving" | "unsaved" | "error"; onTitleChange: (value: string) => void; onBodyChange: (value: string) => void; onSave: () => void }) {
  const { members, shares, recipient: recipientMemberId } = sharing;
  const statusLabel = status === "saved" ? frontendText(locale, "KNOWLEDGE_NOTE_SAVED") : status === "saving" ? frontendText(locale, "KNOWLEDGE_NOTE_SAVING") : status === "unsaved" ? frontendText(locale, "KNOWLEDGE_NOTE_UNSAVED") : status === "error" ? frontendText(locale, "KNOWLEDGE_NOTE_ERROR") : "";
  const shared = access === "shared";
  return <Card data-reader-note="true" data-note-visibility="private" data-note-save="explicit"><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_NOTE_TITLE")}</CardTitle><span className="rounded-full border px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground">{frontendText(locale, shared ? "KNOWLEDGE_NOTE_SHARED" : "KNOWLEDGE_NOTE_PRIVATE")}</span></div><p className="text-xs text-muted-foreground">{frontendText(locale, shared ? "KNOWLEDGE_NOTE_READ_ONLY" : "KNOWLEDGE_NOTE_DESCRIPTION")}</p></CardHeader><CardContent className="space-y-3">{discardError && <p role="alert" data-note-discard-error>{frontendText(locale, "KNOWLEDGE_NOTE_DISCARD_ERROR")}</p>}{phase === "unknown" && <div role="alert"><p>{frontendText(locale, "KNOWLEDGE_NOTE_UNKNOWN")}</p><Button data-note-check variant="outline" size="sm" onClick={onCheck}>{frontendText(locale, "KNOWLEDGE_NOTE_CHECK")}</Button></div>}{phase === "storage-error" && <div role="alert" data-note-storage-error><p>{frontendText(locale, "KNOWLEDGE_NOTE_STORAGE_ERROR")}</p><Button data-note-storage-retry variant="outline" size="sm" onClick={onRetryLoad}>{frontendText(locale, "KNOWLEDGE_NOTE_CHECK")}</Button></div>}{phase === "load-error" && <div role="alert"><p>{frontendText(locale, "KNOWLEDGE_NOTE_LOAD_ERROR")}</p><Button data-note-load-retry variant="outline" size="sm" onClick={onRetryLoad}>{frontendText(locale, "COMMON_RETRY")}</Button></div>}<div><label htmlFor="reader-note-title" className="text-xs font-medium">{frontendText(locale, "KNOWLEDGE_NOTE_TITLE_LABEL")}</label><input id="reader-note-title" value={title} readOnly={shared || locked} onChange={(event) => onTitleChange(event.currentTarget.value)} className="mt-1 flex h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60" maxLength={200} /></div><div><label htmlFor="reader-note-body" className="text-xs font-medium">{frontendText(locale, "KNOWLEDGE_NOTE_BODY_LABEL")}</label><textarea id="reader-note-body" value={body} readOnly={shared || locked} onChange={(event) => onBodyChange(event.currentTarget.value)} className="mt-1 min-h-28 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60" maxLength={16000} /></div>{!shared && <><div className="flex items-center justify-between gap-2"><span role="status" aria-live="polite" className="text-xs text-muted-foreground">{statusLabel}</span><Button size="sm" disabled={locked || status === "saving"} onClick={onSave}>{status === "saving" ? frontendText(locale, "KNOWLEDGE_NOTE_SAVING") : frontendText(locale, "KNOWLEDGE_NOTE_SAVE")}</Button></div><div className="border-t pt-3">{!sharing.available && <p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_NOTE_SHARE_SAVE_FIRST")}</p>}{sharing.phase === "unknown" && <div role="alert"><p>{frontendText(locale, "KNOWLEDGE_NOTE_SHARE_UNKNOWN")}</p><Button data-note-share-check variant="outline" size="sm" onClick={() => void sharing.check()}>{frontendText(locale, "KNOWLEDGE_NOTE_CHECK")}</Button></div>}{sharing.phase === "storage-error" && <div role="alert" data-note-share-storage-error><p>{frontendText(locale, "KNOWLEDGE_NOTE_STORAGE_ERROR")}</p><Button data-note-share-storage-retry variant="outline" size="sm" onClick={sharing.retryLoad}>{frontendText(locale, "KNOWLEDGE_NOTE_CHECK")}</Button></div>}{sharing.phase === "load-error" && <Button data-note-share-retry variant="outline" size="sm" onClick={sharing.retryLoad}>{frontendText(locale, "COMMON_RETRY")}</Button>}<p className="text-xs font-medium">{frontendText(locale, "KNOWLEDGE_NOTE_SHARE_TITLE")}</p><div className="mt-2 flex gap-2"><select aria-label={frontendText(locale, "KNOWLEDGE_NOTE_SHARE_SELECT")} value={recipientMemberId} disabled={sharing.locked} onChange={(event) => sharing.select(event.currentTarget.value)} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"><option value="">{frontendText(locale, "KNOWLEDGE_NOTE_SHARE_SELECT")}</option>{members.filter((member) => !shares.some((share) => share.recipientMemberId === member.id)).map((member) => <option key={member.id} value={member.id}>{member.email}</option>)}</select><Button size="sm" variant="outline" disabled={sharing.locked || !recipientMemberId} onClick={() => sharing.request("share")}>{frontendText(locale, "KNOWLEDGE_NOTE_SHARE_ACTION")}</Button></div>{(sharing.phase === "loading" || sharing.phase === "load-error" || sharing.phase === "storage-error") ? null : shares.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_NOTE_SHARE_EMPTY")}</p> : <ul className="mt-2 space-y-1">{shares.map((share) => <li key={share.recipientMemberId} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{members.find((member) => member.id === share.recipientMemberId)?.email || share.recipientMemberId}</span><button type="button" className="text-primary hover:underline" disabled={sharing.locked} onClick={() => sharing.request("revoke", share)}>{frontendText(locale, "KNOWLEDGE_NOTE_SHARE_REVOKE")}</button></li>)}</ul>}{sharing.error && <p role="alert" className="mt-2 text-xs text-destructive">{frontendText(locale, "KNOWLEDGE_NOTE_SHARE_ERROR")}</p>}</div></>}</CardContent></Card>;
}

function ReaderOutlinePanel({ locale, revision, selectedChunkId, onSelectChunk }: { locale?: LocaleRuntime; revision: KnowledgeRevision; selectedChunkId: string | null; onSelectChunk: (id: string) => void }) {
  const headings = revision.chunks.filter((chunk) => chunk.headingPath.length > 0).map((chunk) => ({
    id: chunk.id,
    label: chunk.headingPath.join(" / ").trim(),
  })).filter((item, index, items) => item.label && items.findIndex((candidate) => candidate.label === item.label) === index);
  return <Card data-reader-outline-card><CardHeader><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_READER_OUTLINE")}</CardTitle></CardHeader><CardContent>{headings.length === 0 ? <p className="text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_OUTLINE_EMPTY")}</p> : <nav aria-label={frontendText(locale, "KNOWLEDGE_READER_OUTLINE")}><ol className="space-y-1">{headings.map((heading) => <li key={heading.id}><button type="button" aria-current={selectedChunkId === heading.id ? "location" : undefined} onClick={() => onSelectChunk(heading.id)} className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground aria-[current=location]:bg-accent aria-[current=location]:font-medium aria-[current=location]:text-foreground">{heading.label}</button></li>)}</ol></nav>}</CardContent></Card>;
}

function RelatedKnowledgePanel({ locale, state, onRetry }: { locale?: LocaleRuntime; state: RelatedState; onRetry?: () => void }) {
  if (state.kind === "loading") return <Card data-related-knowledge="true"><CardHeader><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_RELATED_TITLE")}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RELATED_LOADING")}</CardContent></Card>;
  if (state.kind === "error") return <Card data-related-knowledge="true"><CardHeader><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_RELATED_TITLE")}</CardTitle></CardHeader><CardContent><p role="alert" className="text-sm text-destructive">{frontendText(locale, "KNOWLEDGE_RELATED_UNREAD")}</p>{onRetry && <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>{frontendText(locale, "KNOWLEDGE_RELATED_RETRY")}</Button>}</CardContent></Card>;
  if (state.kind === "idle") return null;
  return <Card data-related-knowledge="true"><CardHeader><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_RELATED_TITLE")}</CardTitle></CardHeader><CardContent>{state.items.length === 0 ? <p className="text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RELATED_EMPTY")}</p> : <div className="grid gap-2">{state.items.map((item) => { const reasons = item.reasonFields.map((field) => relatedFieldLabel(field, locale)).join(", "); return <a key={item.id} href={`/knowledge/${encodeURIComponent(item.id)}`} className="rounded-md border p-3 transition hover:bg-accent"><span className="font-medium">{item.title.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}</span>{reasons && <span className="mt-1 block text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RELATED_MATCHED")} {reasons}</span>}</a>; })}</div>}</CardContent></Card>;
}

function BacklinkPanel({ locale, state, onRetry }: { locale?: LocaleRuntime; state: BacklinkState; onRetry?: () => void }) {
  if (state.kind === "loading") return <Card data-backlinks="true"><CardHeader><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_BACKLINKS_TITLE")}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_BACKLINKS_LOADING")}</CardContent></Card>;
  if (state.kind === "error") return <Card data-backlinks="true"><CardHeader><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_BACKLINKS_TITLE")}</CardTitle></CardHeader><CardContent><p role="alert" className="text-sm text-destructive">{frontendText(locale, "KNOWLEDGE_BACKLINKS_UNREAD")}</p>{onRetry && <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>{frontendText(locale, "KNOWLEDGE_BACKLINKS_RETRY")}</Button>}</CardContent></Card>;
  if (state.kind === "idle") return null;
  return <Card data-backlinks="true"><CardHeader><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_BACKLINKS_TITLE")}</CardTitle></CardHeader><CardContent>{state.items.length === 0 ? <p className="text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_BACKLINKS_EMPTY")}</p> : <div className="grid gap-2">{state.items.map((item) => <a key={item.id} href={"/knowledge/" + encodeURIComponent(item.id)} className="rounded-md border p-3 transition hover:bg-accent"><span className="font-medium">{item.title.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}</span><span className="mt-1 block text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_BACKLINKS_LINES")} {item.startLine}–{item.endLine}</span></a>)}</div>}</CardContent></Card>;
}

function relatedFieldLabel(field: string, locale?: LocaleRuntime): string {
  const key = field === "title" ? "KNOWLEDGE_RELATED_FIELD_TITLE"
    : field === "summary" ? "KNOWLEDGE_RELATED_FIELD_SUMMARY"
      : field === "tags" ? "KNOWLEDGE_RELATED_FIELD_TAGS"
        : field === "code" ? "KNOWLEDGE_RELATED_FIELD_CODE"
          : field === "body" ? "KNOWLEDGE_RELATED_FIELD_BODY" : "COMMON_VALUE_UNAVAILABLE";
  return frontendText(locale, key);
}

function SourcePanel({ locale, revision, selectedChunkId, selectedChunk, onSelectChunk }: { locale?: LocaleRuntime; revision: KnowledgeRevision; selectedChunkId: string | null; selectedChunk?: KnowledgeRevision["chunks"][number]; onSelectChunk: (id: string) => void }) {
  const sourceId = revision.sourceVersionId || frontendText(locale, "COMMON_VALUE_UNAVAILABLE");
  const parser = revision.parserSchemaVersion || frontendText(locale, "COMMON_VALUE_UNAVAILABLE");
  const downloadHref = revision.knowledgeItemId && revision.id ? `/api/knowledge/${encodeURIComponent(revision.knowledgeItemId)}/revisions/${encodeURIComponent(revision.id)}/download` : null;
  return <Card data-source-panel="true"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_READER_SOURCES")}</CardTitle><p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_SOURCE_VERSION")} {revision.sourceVersionOrdinal === null ? "—" : `#${revision.sourceVersionOrdinal}`} · {sourceId}</p><p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_PARSE_STATUS")} {parser} · {revision.indexStatus}</p></div>{downloadHref && <a href={downloadHref} download className="text-xs font-medium text-primary hover:underline">{frontendText(locale, "KNOWLEDGE_READER_DOWNLOAD")}</a>}</div></CardHeader><CardContent className="space-y-3">{revision.chunks.length === 0 ? <p className="text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_SOURCES_EMPTY")}</p> : <div role="list" aria-label={frontendText(locale, "KNOWLEDGE_READER_SOURCES")} className="grid gap-2">{revision.chunks.map((chunk) => <button key={chunk.id} type="button" role="listitem" aria-pressed={selectedChunkId === chunk.id} data-source-selected={selectedChunkId === chunk.id ? "true" : "false"} onClick={() => onSelectChunk(chunk.id)} className="rounded-md border p-3 text-left text-sm transition hover:bg-accent aria-pressed:border-primary aria-pressed:bg-accent"><span className="font-medium">{frontendText(locale, "KNOWLEDGE_READER_SOURCE_CHUNK")} {chunk.ordinal + 1}</span><span className="ml-2 text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_SOURCE_LINES")} {chunk.startLine}–{chunk.endLine}</span><span className="mt-1 block text-xs text-muted-foreground">{locationLabel(chunk.location, locale) || chunk.headingPath.join(" / ") || frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</span></button>)}</div>}{selectedChunk && <div role="status" className="rounded-md bg-muted/40 p-3 text-sm"><p className="font-medium">{frontendText(locale, "KNOWLEDGE_READER_SOURCE_SELECTED")}</p><p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{selectedChunk.text.slice(0, 240)}{selectedChunk.text.length > 240 ? "…" : ""}</p></div>}</CardContent></Card>;
}

function locationLabel(location: KnowledgeSourceLocation | undefined, locale?: LocaleRuntime): string {
  if (!location) return "";
  if (location.kind === "pdf") return `${frontendText(locale, "KNOWLEDGE_READER_SOURCE_PAGE")} ${location.page}`;
  if (location.kind === "spreadsheet") return `${location.sheet} · ${location.range}`;
  return `${frontendText(locale, "KNOWLEDGE_READER_SOURCE_SLIDE")} ${location.slide} · ${location.elementStart}–${location.elementEnd}`;
}

/** Unified-diff text for the beUI code surface. Shiki's diff grammar colours the
 * ± prefixes, and each hunk header keeps the absolute line ranges the previous
 * per-line markup carried. */
function revisionDiffText(diff: KnowledgeRevisionDiff): string {
  return diff.hunks.map((hunk) => {
    const oldCount = hunk.lines.filter((line) => line.kind !== "added").length;
    const newCount = hunk.lines.filter((line) => line.kind !== "removed").length;
    const body = hunk.lines.map((line) => `${line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}${line.text}`);
    return [`@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`, ...body].join("\n");
  }).join("\n");
}

function RevisionDiffPanel({ locale, state }: { locale?: LocaleRuntime; state: DiffState }) {
  if (state.kind === "loading") return <Card><CardContent className="p-5 text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_DIFF_LOADING")}</CardContent></Card>;
  if (state.kind === "error") return <p role="alert" className="text-sm text-destructive">{frontendText(locale, "KNOWLEDGE_READER_DIFF_ERROR")}</p>;
  if (state.kind === "idle") return null;
  const diff = state.diff;
  const statsLabel = frontendText(locale, "KNOWLEDGE_READER_DIFF_STATS").replace("{added}", String(diff.stats.added)).replace("{removed}", String(diff.stats.removed));
  return <Card data-revision-diff="true"><CardHeader><CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_READER_DIFF_TITLE")}</CardTitle><p className="text-xs text-muted-foreground">{statsLabel}</p></CardHeader><CardContent className="space-y-4">{diff.metadataChanges.length > 0 && <div><h3 className="text-sm font-medium">{frontendText(locale, "KNOWLEDGE_READER_DIFF_METADATA")}</h3><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{diff.metadataChanges.map((change) => <li key={change.field}><span className="font-medium">{change.field}</span>: {String(change.from ?? "∅")} → {String(change.to ?? "∅")}</li>)}</ul></div>}{diff.hunks.flatMap((hunk) => hunk.lines).length > 0 ? <CodeBlock code={revisionDiffText(diff)} language="diff" showLineNumbers={false} showStatus={false} maxHeight={480} labels={{ copy: frontendText(locale, "COMMON_COPY_CODE"), copied: frontendText(locale, "COMMON_COPIED") }} /> : <p className="text-sm text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_DIFF_EMPTY")}</p>}{diff.stats.truncated && <p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_READER_DIFF_TRUNCATED")}</p>}</CardContent></Card>;
}
