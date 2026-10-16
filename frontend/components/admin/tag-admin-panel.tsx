import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { PageState } from "../ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ApiRequestError, type Fetcher } from "../../lib/api";
import { createAdminTag, loadAdminTags, type AdminTag } from "../../lib/admin-tags-data";

type TagsState = { kind: "loading" } | { kind: "ready"; items: readonly AdminTag[]; nextCursor: string | null } | { kind: "error"; message: string };

const TAG_PAGE_SIZE = 20;

function messageOf(error: unknown, fallbackKey: string, locale?: LocaleRuntime): string {
  if (error instanceof ApiRequestError) return `${error.code}: ${error.message}`;
  // A rejected response shape carries a stable technical code; show that code
  // instead of an invented message about what went wrong.
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,}$/u.test(error.message)) return error.message;
  return frontendText(locale, fallbackKey);
}

/**
 * Tag administration for one space.
 *
 * The API supports exactly two tag operations for an administrator — list the
 * active tags of a space and create one — so this surface offers exactly those
 * two. Renaming, disabling and deleting tags do not exist server-side and are
 * therefore not drawn as disabled controls; the note says so instead.
 */
export function TagAdminPanel({ spaceId, locale, requester = fetch }: { spaceId: string; locale?: LocaleRuntime; requester?: Fetcher }) {
  const [state, setState] = useState<TagsState>({ kind: "loading" });
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const read = useRef<AbortController | null>(null);

  const load = useCallback((signal: AbortSignal) => {
    setState({ kind: "loading" });
    loadAdminTags({ spaceId, limit: TAG_PAGE_SIZE, cursor: null, requester, signal })
      .then((page) => { if (!signal.aborted) setState({ kind: "ready", items: page.items, nextCursor: page.nextCursor }); })
      .catch((error: unknown) => { if (!signal.aborted) setState({ kind: "error", message: messageOf(error, "ADMIN_TAG_LOAD_FAILED", locale) }); });
  }, [locale, requester, spaceId]);

  // Acting on a conflict: re-reading the authoritative list also clears the stale
  // refusal, so the next creation is a deliberate new attempt.
  const reload = useCallback(() => {
    const controller = new AbortController();
    read.current?.abort();
    read.current = controller;
    setNotice(undefined);
    load(controller.signal);
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    read.current = controller;
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const loadMore = () => {
    if (state.kind !== "ready" || state.nextCursor === null) return;
    const controller = new AbortController();
    read.current = controller;
    loadAdminTags({ spaceId, limit: TAG_PAGE_SIZE, cursor: state.nextCursor, requester, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setState((current) => current.kind === "ready"
          ? { kind: "ready", items: [...current.items, ...page.items], nextCursor: page.nextCursor }
          : current);
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setNotice(messageOf(error, "ADMIN_TAG_LOAD_FAILED", locale)); });
  };

  const submit = async () => {
    setPending(true);
    setNotice(undefined);
    try {
      const created = await createAdminTag({ spaceId, slug, name, requester });
      setState((current) => current.kind === "ready"
        ? { kind: "ready", items: [created, ...current.items.filter((item) => item.id !== created.id)], nextCursor: current.nextCursor }
        : current);
      setSlug("");
      setName("");
      setPending(false);
    } catch (error) {
      setPending(false);
      setNotice(messageOf(error, "ADMIN_TAG_CREATE_FAILED", locale));
    }
  };

  return <Card data-admin-tags={state.kind === "ready" ? "ready" : state.kind} data-admin-tags-space={spaceId}>
    <CardHeader><CardTitle>{frontendText(locale, "ADMIN_TAG_TITLE")}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground" data-admin-tag-scope-note>{frontendText(locale, "ADMIN_TAG_SCOPE_NOTE")}</p>
      {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
        : state.kind === "error" ? <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{state.message}</p>
          <Button type="button" variant="outline" onClick={() => { const controller = new AbortController(); read.current = controller; load(controller.signal); }}>
            {frontendText(locale, "COMMON_RETRY")}
          </Button>
        </div>
        : state.items.length === 0 ? <PageState kind="empty" title={frontendText(locale, "ADMIN_TAG_EMPTY")} />
        : <ul className="divide-y rounded-md border">
          {state.items.map((tag) => <li key={tag.id} data-admin-tag={tag.id} data-admin-tag-slug-value={tag.slug}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="font-medium">{tag.name}</span>
            <span className="text-muted-foreground">{tag.slug}</span>
          </li>)}
        </ul>}
      {state.kind === "ready" && state.nextCursor !== null && <Button type="button" variant="outline" data-admin-tag-more onClick={loadMore}>
        {frontendText(locale, "ADMIN_TAG_LOAD_MORE")}
      </Button>}

      <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm font-medium">{frontendText(locale, "ADMIN_TAG_CREATE_TITLE")}</p>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm" htmlFor="tag-slug">{frontendText(locale, "ADMIN_TAG_SLUG")}
            <input id="tag-slug" data-admin-tag-slug value={slug} disabled={pending} autoComplete="off" spellCheck={false} maxLength={80}
              onChange={(event) => setSlug(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" /></label>
          <label className="flex flex-col gap-1 text-sm" htmlFor="tag-name">{frontendText(locale, "ADMIN_TAG_NAME")}
            <input id="tag-name" data-admin-tag-name value={name} disabled={pending} autoComplete="off" spellCheck={false} maxLength={120}
              onChange={(event) => setName(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" /></label>
        </div>
        <Button type="button" data-admin-tag-create
          disabled={pending || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || name.trim().length === 0}
          onClick={() => void submit()}>
          {frontendText(locale, "ADMIN_TAG_CREATE")}
        </Button>
        <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_TAG_CREATE_HINT")}</p>
      </div>
      {notice && <div className="space-y-2">
        <p role="alert" data-admin-tag-notice className="text-sm text-destructive">{notice}</p>
        <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_TAG_CONFLICT_NOTE")}</p>
        <Button type="button" variant="outline" data-admin-tag-reload onClick={reload}>{frontendText(locale, "ADMIN_TAG_RELOAD")}</Button>
      </div>}
    </CardContent>
  </Card>;
}
