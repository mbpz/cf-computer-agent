import { useEffect, useRef, useState } from "react";
import { submitAgentFeedback, type AgentFeedbackRating } from "../../lib/agent-data";
import { clearAgentFeedback, loadAgentFeedback, saveAgentFeedback } from "../../lib/agent-feedback-intent";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { FeedbackWidget } from "../motion/feedback-widget";

export interface AgentFeedbackAdmission {
  begin: (conversationId: string) => boolean;
  settled: (conversationId: string) => void;
}

// Feedback belongs to the conversation, not an individual immutable answer.
// The beUI `feedback-widget` owns the corner trigger, the morph, the focus
// timer and the sent auto-close; this wrapper owns the conversation contract:
// `AgentFeedbackAdmission.begin/settled` around exactly one attempt, the tab
// record that survives reload, and the two unknown-result recoveries. A
// refused admission returns `false` to the widget, so the panel keeps its
// rating surfaces instead of entering a false sending/sent state.
export function AgentFeedback({ conversationId, citationIds, locale, admission, memberId }: { conversationId: string; citationIds: readonly string[]; locale?: LocaleRuntime; admission?: AgentFeedbackAdmission; memberId?: string }) {
  const [stored] = useState(() => memberId ? loadAgentFeedback(memberId) : { kind: "empty" as const });
  const restored = stored.kind === "ready" && stored.intent.conversationId === conversationId ? stored.intent : null;
  const [recordBlocked] = useState(stored.kind === "blocked");
  const [notice, setNotice] = useState<string>();
  const [completed, setCompleted] = useState(false);
  const pending = useRef(false);
  const saved = useRef(false);
  const admissionRef = useRef(admission); admissionRef.current = admission;
  const mounted = useRef(true);
  const intent = useRef<{ rating: AgentFeedbackRating; citationIds: string[] } | null>(restored ? { rating: restored.rating, citationIds: [...restored.citationIds] } : null);
  useEffect(() => {
    mounted.current = true;
    if (restored) admissionRef.current?.begin(conversationId);
    return () => { mounted.current = false; };
  }, []);
  const send = (rating?: AgentFeedbackRating): false | Promise<void> => {
    if (!mounted.current || pending.current || saved.current || recordBlocked || completed) return false;
    const current = intent.current ?? (rating ? { rating, citationIds: [...citationIds] } : null);
    if (!current) return false;
    if (admissionRef.current && !admissionRef.current.begin(conversationId)) return false;
    if (!intent.current && memberId && !saveAgentFeedback(memberId, { conversationId, rating: current.rating, citationIds: current.citationIds })) {
      admissionRef.current?.settled(conversationId);
      setNotice(frontendText(locale, "AGENT_FEEDBACK_NOT_RECORDED"));
      return false;
    }
    intent.current = current;
    pending.current = true; setNotice(undefined);
    return submitAgentFeedback(conversationId, current.rating, current.citationIds).then(() => {
      if (!mounted.current) return;
      if (memberId && !clearAgentFeedback(memberId, { conversationId, rating: current.rating, citationIds: current.citationIds })) {
        setNotice(frontendText(locale, "AGENT_FEEDBACK_RECORD_STUCK"));
        throw new Error("AGENT_FEEDBACK_RECORD_STUCK");
      }
      saved.current = true; setCompleted(true); admissionRef.current?.settled(conversationId);
    }).finally(() => { pending.current = false; });
  };
  return <section className="space-y-3" aria-label={frontendText(locale, "AGENT_FEEDBACK_TITLE")}>
    <FeedbackWidget
      title={frontendText(locale, "AGENT_FEEDBACK_TITLE")}
      detail={frontendText(locale, "AGENT_FEEDBACK_DETAIL")}
      labels={{
        close: frontendText(locale, "COMMON_DISMISS"),
        sending: frontendText(locale, "AGENT_FEEDBACK_SENDING"),
        sentTitle: frontendText(locale, "AGENT_FEEDBACK_SAVED"),
        errorTitle: notice ?? frontendText(locale, "AGENT_FEEDBACK_UNKNOWN"),
        retry: frontendText(locale, "AGENT_FEEDBACK_RETRY"),
        cancel: frontendText(locale, "COMMON_DISMISS"),
        submit: frontendText(locale, "AGENT_FEEDBACK_USEFUL"),
      }}
      ratings={[
        { value: "useful", label: frontendText(locale, "AGENT_FEEDBACK_USEFUL") },
        { value: "not_useful", label: frontendText(locale, "AGENT_FEEDBACK_NOT_USEFUL") },
        { value: "citation_error", label: frontendText(locale, "AGENT_FEEDBACK_CITATION_ERROR"), disabled: citationIds.length === 0 },
      ]}
      citationIds={citationIds}
      disabled={recordBlocked || completed}
      initialStatus={restored ? "error" : "idle"}
      onSubmit={({ rating }) => send(rating as AgentFeedbackRating | undefined)}
      persistent={notice ? <p role="alert" className="mt-2 text-xs leading-relaxed">{notice}</p> : undefined}
    />
  </section>;
}
