import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
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
      <Button variant="outline" size="sm" type="button" data-submission-target-retry className="max-lg:min-h-11" onClick={() => actions.retry()}>{text("SUBMIT_TARGET_RETRY")}</Button>
    </div>}
    {view.kind === "ready" && spaces.length === 0 && <p data-submission-target-empty className="text-sm">{text("SUBMIT_TARGET_EMPTY")}</p>}
    {view.storedTargetMissing && <p data-submission-target-stored-missing role="status" className="text-sm">{text("SUBMIT_TARGET_STORED_MISSING")}</p>}
    <label className="block space-y-1">
      <span className="text-sm">{text("SUBMIT_TARGET_SPACE")}</span>
      <Select value={view.spaceId ?? ""} disabled={spaces.length === 0} onValueChange={(value) => actions.selectSpace(value)}>
        <SelectTrigger data-submission-target-space><SelectValue /></SelectTrigger>
        <SelectContent>{spaces.map((space) => <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>)}</SelectContent>
      </Select>
    </label>
    <label className="block space-y-1">
      <span className="text-sm">{text("SUBMIT_TARGET_COLLECTION")}</span>
      <Select value={view.collectionId ?? ""} disabled={view.spaceId === null || !collectionsReady} onValueChange={(value) => actions.selectCollection(value === "" ? null : value)}>
        <SelectTrigger data-submission-target-collection data-submission-target-collection-loading={view.collections.kind === "loading" ? "" : undefined}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="">{text("SUBMIT_TARGET_COLLECTION_NONE")}</SelectItem>
          {collectionsReady && collections.map((collection) => <SelectItem key={collection.id} value={collection.id}>{collection.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
    {view.spaceId !== null && view.collections.kind === "loading" && <p className="text-sm">{text("SUBMIT_TARGET_COLLECTION_LOADING")}</p>}
    {view.spaceId !== null && view.collections.kind === "error" && <div role="alert" className="space-y-2 text-sm">
      <p data-submission-target-collection-error>{text("SUBMIT_TARGET_COLLECTION_ERROR")}</p>
      <Button variant="outline" size="sm" type="button" data-submission-target-collection-retry className="max-lg:min-h-11" onClick={() => actions.retryCollections()}>{text("SUBMIT_TARGET_COLLECTION_RETRY")}</Button>
    </div>}
    {view.spaceId !== null && collectionsReady && collections.length === 0 && <p data-submission-target-collection-empty className="text-sm">{text("SUBMIT_TARGET_COLLECTION_EMPTY")}</p>}
    {view.collections.hasMore && <Button variant="outline" size="sm" type="button" data-submission-target-more-collections className="max-lg:min-h-11" onClick={() => actions.loadMoreCollections()}>{text("SUBMIT_TARGET_MORE_COLLECTIONS")}</Button>}
    <label className="block space-y-1">
      <span className="text-sm">{text("SUBMIT_TARGET_VISIBILITY")}</span>
      <Select value={view.visibility} onValueChange={(value) => actions.selectVisibility(value === "admin_only" ? "admin_only" : "shared")}>
        <SelectTrigger data-submission-target-visibility><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="shared">{text("SUBMIT_TARGET_SHARED")}</SelectItem>
          <SelectItem value="admin_only">{text("SUBMIT_TARGET_ADMIN_ONLY")}</SelectItem>
        </SelectContent>
      </Select>
    </label>
    {view.hasMoreSpaces && <Button variant="outline" size="sm" type="button" data-submission-target-more-spaces className="max-lg:min-h-11" onClick={() => actions.loadMoreSpaces()}>{text("SUBMIT_TARGET_MORE_SPACES")}</Button>}
  </fieldset>;
}
