import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { isSubmittableSpace, type SubmissionTargetsActions, type SubmissionTargetsView } from "../../lib/submission-targets-data";

export type { SubmissionTargetsActions, SubmissionTargetsView } from "../../lib/submission-targets-data";

/**
 * Presentational member-side Space/Collection target picker. It renders exactly the loaded options —
 * it never synthesizes a Space or Collection — and owns no submit-button logic.
 */
export function SubmissionTargetPicker({ locale, view, actions }: { locale?: LocaleRuntime; view: SubmissionTargetsView; actions: SubmissionTargetsActions }) {
  const text = (key: string) => frontendText(locale, key);
  const spaces = view.spaces.filter(isSubmittableSpace);
  const collections = view.collections.items.filter((collection) => collection.status === "active");
  const collectionsReady = view.collections.kind === "ready";

  return <fieldset data-submission-target={view.kind} className="space-y-3">
    <legend className="text-sm font-medium">{text("SUBMIT_TARGET_TITLE")}</legend>
    {view.kind === "loading" && <p data-submission-target-loading className="text-sm">{text("SUBMIT_TARGET_LOADING")}</p>}
    {view.kind === "error" && <div role="alert" className="space-y-2 text-sm">
      <p>{text("SUBMIT_TARGET_ERROR")}</p>
      <button type="button" data-submission-target-retry className="rounded-md border px-3 py-2" onClick={() => actions.retry()}>{text("SUBMIT_TARGET_RETRY")}</button>
    </div>}
    {view.kind === "ready" && spaces.length === 0 && <p data-submission-target-empty className="text-sm">{text("SUBMIT_TARGET_EMPTY")}</p>}
    {view.storedTargetMissing && <p data-submission-target-stored-missing role="status" className="text-sm">{text("SUBMIT_TARGET_STORED_MISSING")}</p>}
    <label className="block space-y-1">
      <span className="text-sm">{text("SUBMIT_TARGET_SPACE")}</span>
      <select data-submission-target-space className="w-full rounded-md border px-3 py-2" value={view.spaceId ?? ""} disabled={spaces.length === 0} onChange={(event) => actions.selectSpace(event.target.value)}>
        {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
      </select>
    </label>
    <label className="block space-y-1">
      <span className="text-sm">{text("SUBMIT_TARGET_COLLECTION")}</span>
      <select data-submission-target-collection data-submission-target-collection-loading={view.collections.kind === "loading" ? "" : undefined} className="w-full rounded-md border px-3 py-2" value={view.collectionId ?? ""} disabled={view.spaceId === null || !collectionsReady} onChange={(event) => actions.selectCollection(event.target.value === "" ? null : event.target.value)}>
        <option value="">{text("SUBMIT_TARGET_COLLECTION_NONE")}</option>
        {collectionsReady && collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
      </select>
    </label>
    {view.spaceId !== null && view.collections.kind === "loading" && <p className="text-sm">{text("SUBMIT_TARGET_COLLECTION_LOADING")}</p>}
    {view.spaceId !== null && view.collections.kind === "error" && <div role="alert" className="space-y-2 text-sm">
      <p data-submission-target-collection-error>{text("SUBMIT_TARGET_COLLECTION_ERROR")}</p>
      <button type="button" data-submission-target-collection-retry className="rounded-md border px-3 py-2" onClick={() => actions.retryCollections()}>{text("SUBMIT_TARGET_COLLECTION_RETRY")}</button>
    </div>}
    {view.spaceId !== null && collectionsReady && collections.length === 0 && <p data-submission-target-collection-empty className="text-sm">{text("SUBMIT_TARGET_COLLECTION_EMPTY")}</p>}
    {view.collections.hasMore && <button type="button" data-submission-target-more-collections className="rounded-md border px-3 py-2 text-sm" onClick={() => actions.loadMoreCollections()}>{text("SUBMIT_TARGET_MORE_COLLECTIONS")}</button>}
    <label className="block space-y-1">
      <span className="text-sm">{text("SUBMIT_TARGET_VISIBILITY")}</span>
      <select data-submission-target-visibility className="w-full rounded-md border px-3 py-2" value={view.visibility} onChange={(event) => actions.selectVisibility(event.target.value === "admin_only" ? "admin_only" : "shared")}>
        <option value="shared">{text("SUBMIT_TARGET_SHARED")}</option>
        <option value="admin_only">{text("SUBMIT_TARGET_ADMIN_ONLY")}</option>
      </select>
    </label>
    {view.hasMoreSpaces && <button type="button" data-submission-target-more-spaces className="rounded-md border px-3 py-2 text-sm" onClick={() => actions.loadMoreSpaces()}>{text("SUBMIT_TARGET_MORE_SPACES")}</button>}
  </fieldset>;
}
