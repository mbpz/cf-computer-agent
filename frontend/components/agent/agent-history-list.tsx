import { useEffect, useRef, useState } from "react";
import { loadAgentConversations, type AgentConversationList } from "../../lib/agent-data";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { Button } from "../ui/button";

// No questions or source titles are listed; opening a conversation reauthorizes its citations.
export function AgentHistoryList({ locale }: { locale?: LocaleRuntime }) {
  const [opened, setOpened] = useState(false);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState<AgentConversationList | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const moving = useRef(false);
  const cursor = cursors.at(-1);
  useEffect(() => {
    if (!opened) return;
    const abort = new AbortController(); let current = true;
    moving.current = true; setStatus("loading"); setPage(null);
    void loadAgentConversations({ cursor, signal: abort.signal }).then((value) => {
      if (current) { setPage(value); setStatus("ready"); }
    }).catch(() => { if (current) setStatus("error"); }).finally(() => { if (current) moving.current = false; });
    return () => { current = false; abort.abort(); };
  }, [opened, cursor, version]);
  const navigate = (next: Array<string | undefined>) => {
    if (moving.current) return;
    moving.current = true; setPage(null); setStatus("loading"); setCursors(next); setVersion((v) => v + 1);
  };
  if (!opened) return <Button type="button" variant="outline" onClick={() => setOpened(true)}>{frontendText(locale, "AGENT_LIST_TITLE")}</Button>;
  return <section className="space-y-3 rounded-md border p-4" aria-label={frontendText(locale, "AGENT_LIST_TITLE")}>
    <h2 className="font-medium">{frontendText(locale, "AGENT_LIST_TITLE")}</h2>
    <p className="text-sm text-muted-foreground">{frontendText(locale, "AGENT_LIST_DETAIL")}</p>
    {status === "loading" && <p role="status">{frontendText(locale, "AGENT_LIST_LOADING")}</p>}
    {status === "error" && <div role="alert"><p>{frontendText(locale, "AGENT_LIST_ERROR")}</p><Button type="button" onClick={() => navigate(cursors)}>{frontendText(locale, "AGENT_LIST_RETRY")}</Button></div>}
    {status === "ready" && page && <>{!page.items.length && <p>{frontendText(locale, "AGENT_LIST_EMPTY")}</p>}<ul className="space-y-2">{page.items.map((item) => <li key={item.id}><a className="underline break-all" href={`/agent?conversationId=${encodeURIComponent(item.id)}`}>{item.createdAt} · {item.id}</a></li>)}</ul></>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={status === "loading" || cursors.length <= 1} onClick={() => navigate(cursors.slice(0, -1))}>{frontendText(locale, "AGENT_LIST_PREVIOUS")}</Button>
      <Button type="button" variant="outline" disabled={status !== "ready" || !page?.nextCursor} onClick={() => { if (page?.nextCursor) navigate([...cursors, page.nextCursor]); }}>{frontendText(locale, "AGENT_LIST_NEXT")}</Button>
      <Button type="button" variant="outline" disabled={status === "loading"} onClick={() => navigate([undefined])}>{frontendText(locale, "AGENT_LIST_REFRESH")}</Button>
    </div>
  </section>;
}
