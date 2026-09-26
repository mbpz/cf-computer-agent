import { useEffect, useRef, useState } from "react";
import { submitAgentFeedback, type AgentFeedbackRating } from "../../lib/agent-data";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { Button } from "../ui/button";

// Feedback belongs to the conversation, not an individual immutable answer.
export function AgentFeedback({ conversationId, citationIds, locale }: { conversationId: string; citationIds: readonly string[]; locale?: LocaleRuntime }) {
  const [state, setState] = useState<"idle" | "pending" | "unknown" | "saved">("idle");
  const pending = useRef(false);
  const mounted = useRef(true);
  const intent = useRef<{ rating: AgentFeedbackRating; citationIds: string[] } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const send = (rating?: AgentFeedbackRating) => {
    if (pending.current || state === "saved") return;
    if (!intent.current && rating) intent.current = { rating, citationIds: [...citationIds] };
    const current = intent.current;
    if (!current) return;
    pending.current = true; setState("pending");
    void submitAgentFeedback(conversationId, current.rating, current.citationIds).then(() => {
      if (mounted.current) setState("saved");
    }).catch(() => { if (mounted.current) setState("unknown"); }).finally(() => { pending.current = false; });
  };
  return <section className="space-y-3 rounded-md border p-4" aria-label={frontendText(locale, "AGENT_FEEDBACK_TITLE")}>
    <h3 className="font-medium">{frontendText(locale, "AGENT_FEEDBACK_TITLE")}</h3>
    <p className="text-sm text-muted-foreground">{frontendText(locale, "AGENT_FEEDBACK_DETAIL")}</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={state !== "idle"} onClick={() => send("useful")}>{frontendText(locale, "AGENT_FEEDBACK_USEFUL")}</Button>
      <Button type="button" variant="outline" disabled={state !== "idle"} onClick={() => send("not_useful")}>{frontendText(locale, "AGENT_FEEDBACK_NOT_USEFUL")}</Button>
      <Button type="button" variant="outline" disabled={state !== "idle" || citationIds.length === 0} onClick={() => send("citation_error")}>{frontendText(locale, "AGENT_FEEDBACK_CITATION_ERROR")}</Button>
    </div>
    {state === "pending" && <p role="status">{frontendText(locale, "AGENT_FEEDBACK_SENDING")}</p>}
    {state === "saved" && <p role="status">{frontendText(locale, "AGENT_FEEDBACK_SAVED")}</p>}
    {state === "unknown" && <div role="alert"><p>{frontendText(locale, "AGENT_FEEDBACK_UNKNOWN")}</p><Button type="button" className="mt-2" onClick={() => send()}>{frontendText(locale, "AGENT_FEEDBACK_RETRY")}</Button></div>}
  </section>;
}
