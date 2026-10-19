import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { Fetcher } from "../../lib/api";
import { loadAdminTags, type AdminTag } from "../../lib/admin-tags-data";
import { isSubmittableSpace, loadSpaceCollections, loadSubmissionSpaces, type MemberCollection, type MemberSpace } from "../../lib/submission-targets-data";
import { reviewVisibilityExpansion, type ReviewPublishInput } from "./review-detail-data";

/**
 * The reviewer's editable publication metadata: title, target Space/Collection,
 * the space's active tags and visibility. The server already accepts these as
 * publish overrides; this form is the one place they are edited, so the page can
 * keep the read-only submission content and the decision controls apart.
 *
 * `preview.tagIds` arrives as the initial selection and is preserved until the
 * reviewer changes the Space, because tags are scoped to one Space. The only
 * blocking rule lives in the route: an `admin_only` request published as
 * `shared` is a visibility expansion and needs the explicit checkbox here.
 */
type MetadataOptions<T> = { kind: "loading" } | { kind: "error" } | { kind: "ready"; items: readonly T[]; nextCursor: string | null };

async function loadAllSpacePages(requester: Fetcher, signal: AbortSignal): Promise<MemberSpace[]> {
  const items: MemberSpace[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_OPTION_PAGES; page += 1) {
    const result = await loadSubmissionSpaces({ ...(cursor === undefined ? {} : { cursor }), requester, signal });
    items.push(...result.items);
    cursor = result.nextCursor;
    if (cursor === undefined) break;
  }
  return items;
}

async function loadAllCollectionPages(spaceId: string, requester: Fetcher, signal: AbortSignal): Promise<MemberCollection[]> {
  const items: MemberCollection[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_OPTION_PAGES; page += 1) {
    const result = await loadSpaceCollections(spaceId, { ...(cursor === undefined ? {} : { cursor }), requester, signal });
    items.push(...result.items);
    cursor = result.nextCursor;
    if (cursor === undefined) break;
  }
  return items;
}

/** The sentinel a beUI picker uses for "no collection"; never a valid target id. */
const NO_COLLECTION = "__none__";

/** Server limits: at most 20 tags and 200 title code points per publish. */
const MAX_TAGS = 20;
/** Members' target endpoints page at 50; fold a bounded number of pages so a
 * target beyond the first page is still selectable instead of silently missing. */
const MAX_OPTION_PAGES = 5;

export function ReviewPublishMetadataForm({ value, requestedVisibility, expansionConfirmed, onExpansionChange, onChange, disabled = false, locale, requester = fetch }: {
  value: ReviewPublishInput;
  requestedVisibility: "shared" | "admin_only";
  expansionConfirmed: boolean;
  onExpansionChange: (confirmed: boolean) => void;
  onChange: (next: ReviewPublishInput) => void;
  disabled?: boolean;
  locale?: LocaleRuntime;
  requester?: Fetcher;
}) {
  const id = useId();
  const alive = useRef(true);
  const [spacesVersion, setSpacesVersion] = useState(0);
  const [spaces, setSpaces] = useState<MetadataOptions<MemberSpace>>({ kind: "loading" });
  const [collections, setCollections] = useState<MetadataOptions<MemberCollection>>({ kind: "loading" });
  const [collectionsVersion, setCollectionsVersion] = useState(0);
  const [tags, setTags] = useState<MetadataOptions<AdminTag>>({ kind: "loading" });
  const [tagsVersion, setTagsVersion] = useState(0);
  const [tagsPending, setTagsPending] = useState(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const spaceId = value.spaceId;
  useEffect(() => {
    const controller = new AbortController();
    setSpaces({ kind: "loading" });
    void loadAllSpacePages(requester, controller.signal).then((items) => {
      if (!alive.current || controller.signal.aborted) return;
      setSpaces({ kind: "ready", items, nextCursor: null });
    }).catch(() => {
      if (alive.current && !controller.signal.aborted) setSpaces({ kind: "error" });
    });
    return () => controller.abort();
  }, [requester, spacesVersion]);

  useEffect(() => {
    if (!spaceId) { setCollections({ kind: "ready", items: [], nextCursor: null }); return; }
    const controller = new AbortController();
    setCollections({ kind: "loading" });
    void loadAllCollectionPages(spaceId, requester, controller.signal).then((items) => {
      if (!alive.current || controller.signal.aborted) return;
      setCollections({ kind: "ready", items, nextCursor: null });
    }).catch(() => {
      if (alive.current && !controller.signal.aborted) setCollections({ kind: "error" });
    });
    return () => controller.abort();
  }, [requester, spaceId, collectionsVersion]);

  useEffect(() => {
    if (!spaceId) { setTags({ kind: "ready", items: [], nextCursor: null }); return; }
    const controller = new AbortController();
    setTags({ kind: "loading" });
    void loadAdminTags({ spaceId, limit: 50, cursor: null, requester, signal: controller.signal }).then((page) => {
      if (!alive.current || controller.signal.aborted) return;
      setTags({ kind: "ready", items: page.items, nextCursor: page.nextCursor });
    }).catch(() => {
      if (alive.current && !controller.signal.aborted) setTags({ kind: "error" });
    });
    return () => controller.abort();
  }, [requester, spaceId, tagsVersion]);

  const loadMoreTags = async () => {
    if (tagsPending || tags.kind !== "ready" || tags.nextCursor === null) return;
    setTagsPending(true);
    try {
      const page = await loadAdminTags({ spaceId, limit: 50, cursor: tags.nextCursor, requester });
      if (!alive.current) return;
      setTags((current) => current.kind === "ready"
        ? { kind: "ready", items: [...current.items, ...page.items.filter((tag) => !current.items.some((item) => item.id === tag.id))], nextCursor: page.nextCursor }
        : current);
    } catch {
      // The loaded options stay authoritative; a failed page adds nothing.
    } finally {
      if (alive.current) setTagsPending(false);
    }
  };

  const spacesReady = spaces.kind === "ready" ? spaces.items.filter(isSubmittableSpace) : [];
  const currentSpaceListed = spaces.kind !== "ready" || spacesReady.some((space) => space.id === value.spaceId);
  const collectionItems = collections.kind === "ready" ? collections.items.filter((collection) => collection.status === "active") : [];
  const currentCollectionListed = value.collectionId === null || collectionItems.some((collection) => collection.id === value.collectionId);
  const tagItems = tags.kind === "ready" ? tags.items : [];
  const unlistedTags = value.tagIds.filter((tagId) => !tagItems.some((tag) => tag.id === tagId));
  const expansionRequired = reviewVisibilityExpansion(requestedVisibility, value.visibility);
  const titleMissing = value.title.trim().length === 0;
  const optionsUnavailable = disabled || !currentSpaceListed;

  const chooseSpace = (nextSpaceId: string) => {
    if (disabled || nextSpaceId === value.spaceId) return;
    // Tags are space-scoped and the target space may not carry them, so changing
    // the Space starts from an empty tag selection rather than carrying an
    // invalid id across.
    onChange({ ...value, spaceId: nextSpaceId, collectionId: null, tagIds: [] });
    onExpansionChange(false);
  };
  const tagsAtLimit = value.tagIds.length >= MAX_TAGS;
  const toggleTag = (tagId: string, checked: boolean) => {
    if (disabled) return;
    if (checked && tagsAtLimit && !value.tagIds.includes(tagId)) return;
    const tagIds = checked
      ? [...value.tagIds.filter((current) => current !== tagId), tagId]
      : value.tagIds.filter((current) => current !== tagId);
    onChange({ ...value, tagIds });
  };

  return <Card data-review-publish-metadata>
    <CardHeader>
      <CardTitle>{frontendText(locale, "ADMIN_REVIEW_PUBLISH_METADATA")}</CardTitle>
      <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_PUBLISH_METADATA_HINT")}</p>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor={`${id}-title`}>{frontendText(locale, "ADMIN_REVIEW_METADATA_TITLE")}</Label>
        <Input id={`${id}-title`} data-review-metadata-title value={value.title} disabled={disabled} maxLength={200}
          error={titleMissing ? frontendText(locale, "ADMIN_REVIEW_METADATA_TITLE_REQUIRED") : undefined}
          onChange={(title) => onChange({ ...value, title })} />
      </div>
      {spaces.kind === "loading" && <p role="status" className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_METADATA_OPTIONS_LOADING")}</p>}
      {spaces.kind === "error" && <div role="alert" data-review-metadata-spaces-error className="space-y-2 text-sm text-destructive">
        <p>{frontendText(locale, "ADMIN_REVIEW_METADATA_SPACES_ERROR")}</p>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setSpacesVersion((version) => version + 1)}>{frontendText(locale, "ADMIN_REVIEW_METADATA_OPTIONS_RETRY")}</Button>
      </div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-space`}>{frontendText(locale, "ADMIN_REVIEW_METADATA_SPACE")}</Label>
          <Select value={currentSpaceListed ? value.spaceId : ""} disabled={optionsUnavailable || spaces.kind !== "ready"} onValueChange={chooseSpace}>
            <SelectTrigger id={`${id}-space`} data-review-metadata-space aria-label={frontendText(locale, "ADMIN_REVIEW_METADATA_SPACE")}><SelectValue placeholder={frontendText(locale, "ADMIN_REVIEW_METADATA_SPACE")} /></SelectTrigger>
            <SelectContent>{spacesReady.map((space) => <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>)}</SelectContent>
          </Select>
          {!currentSpaceListed && <p role="alert" className="text-xs text-destructive">{frontendText(locale, "ADMIN_REVIEW_METADATA_TARGET_REQUIRED")}</p>}
          {spaces.kind === "ready" && spacesReady.length === 0 && <p role="alert" className="text-xs text-destructive">{frontendText(locale, "ADMIN_REVIEW_METADATA_TARGET_REQUIRED")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-collection`}>{frontendText(locale, "ADMIN_REVIEW_METADATA_COLLECTION")}</Label>
          <Select value={value.collectionId ?? NO_COLLECTION} disabled={optionsUnavailable || collections.kind !== "ready"} onValueChange={(next) => { if (!disabled) onChange({ ...value, collectionId: next === NO_COLLECTION ? null : next }); }}>
            <SelectTrigger id={`${id}-collection`} data-review-metadata-collection aria-label={frontendText(locale, "ADMIN_REVIEW_METADATA_COLLECTION")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_COLLECTION}>{frontendText(locale, "ADMIN_REVIEW_METADATA_NO_COLLECTION")}</SelectItem>
              {collectionItems.map((collection) => <SelectItem key={collection.id} value={collection.id}>{collection.name}</SelectItem>)}
              {!currentCollectionListed && value.collectionId !== null && <SelectItem value={value.collectionId}>{value.collectionId}</SelectItem>}
            </SelectContent>
          </Select>
          {collections.kind === "loading" && <p role="status" className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_METADATA_COLLECTIONS_LOADING")}</p>}
          {collections.kind === "error" && <div role="alert" data-review-metadata-collections-error className="space-y-1 text-xs text-destructive">
            <p>{frontendText(locale, "ADMIN_REVIEW_METADATA_COLLECTIONS_ERROR")}</p>
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setCollectionsVersion((version) => version + 1)}>{frontendText(locale, "ADMIN_REVIEW_METADATA_OPTIONS_RETRY")}</Button>
          </div>}
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">{frontendText(locale, "ADMIN_REVIEW_METADATA_TAGS")}</legend>
        <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_METADATA_TAGS_HINT")}</p>
        {tags.kind === "loading" && <p role="status" className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_METADATA_OPTIONS_LOADING")}</p>}
        {tags.kind === "error" && <div role="alert" data-review-metadata-tags-error className="space-y-1 text-xs text-destructive">
          <p>{frontendText(locale, "ADMIN_REVIEW_METADATA_TAGS_RETRY")}</p>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setTagsVersion((version) => version + 1)}>{frontendText(locale, "ADMIN_REVIEW_METADATA_OPTIONS_RETRY")}</Button>
        </div>}
        {tags.kind === "ready" && tagItems.length === 0 && unlistedTags.length === 0 && <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_METADATA_TAGS_EMPTY")}</p>}
        {tags.kind === "ready" && (tagItems.length > 0 || unlistedTags.length > 0) && <div className="flex flex-wrap gap-x-4 gap-y-2">
          {tagItems.map((tag) => <Checkbox key={tag.id} data-review-tag={tag.id} checked={value.tagIds.includes(tag.id)} disabled={optionsUnavailable || (tagsAtLimit && !value.tagIds.includes(tag.id))}
            label={tag.name} onCheckedChange={(checked) => toggleTag(tag.id, checked)} />)}
          {unlistedTags.map((tagId) => <Checkbox key={tagId} data-review-tag={tagId} checked disabled={optionsUnavailable}
            label={tagId} onCheckedChange={(checked) => toggleTag(tagId, checked)} />)}
        </div>}
        {tags.kind === "ready" && tags.nextCursor !== null && <Button type="button" variant="outline" size="sm" data-review-tag-more disabled={optionsUnavailable || tagsPending} onClick={() => void loadMoreTags()}>{frontendText(locale, "ADMIN_REVIEW_METADATA_TAGS_MORE")}</Button>}
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor={`${id}-visibility`}>{frontendText(locale, "ADMIN_REVIEW_METADATA_VISIBILITY")}</Label>
        <Select value={value.visibility} disabled={disabled} onValueChange={(next) => {
          if (disabled) return;
          const visibility = next === "admin_only" ? "admin_only" : "shared";
          if (visibility !== "shared") onExpansionChange(false);
          onChange({ ...value, visibility });
        }}>
          <SelectTrigger id={`${id}-visibility`} data-review-metadata-visibility aria-label={frontendText(locale, "ADMIN_REVIEW_METADATA_VISIBILITY")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="shared">{frontendText(locale, "ADMIN_REVIEW_METADATA_VISIBILITY_SHARED")}</SelectItem>
            <SelectItem value="admin_only">{frontendText(locale, "ADMIN_REVIEW_METADATA_VISIBILITY_ADMIN_ONLY")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_METADATA_VISIBILITY_HINT")}</p>
      </div>
      {expansionRequired && <div className="space-y-2 rounded-md border border-destructive/40 p-3">
        <Checkbox data-review-visibility-expansion checked={expansionConfirmed} disabled={disabled}
          label={frontendText(locale, "ADMIN_REVIEW_VISIBILITY_EXPANSION")}
          description={frontendText(locale, "ADMIN_REVIEW_VISIBILITY_EXPANSION_HINT")}
          onCheckedChange={(checked) => { if (!disabled) onExpansionChange(checked); }} />
        {!expansionConfirmed && <p role="alert" className="text-xs text-destructive">{frontendText(locale, "ADMIN_REVIEW_VISIBILITY_EXPANSION_REQUIRED")}</p>}
      </div>}
    </CardContent>
  </Card>;
}
