import { Message, MessageBubble, MessageBubbleContent, MessageContent, MessageFooter, MessageHeader, MessageScroller } from "../agents/message";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AgentConversation } from "../../lib/agent-data";

/** The restored conversation, drawn with beUI's message parts: the scroller owns
 * the transcript region and its live log, `Message` owns the per-turn row and
 * `MessageBubble` the surface. Each row keeps the localized role name this page
 * has always shown (question / previous answer) and each citation keeps its
 * link, because a restored transcript is a re-read of server-held history and
 * not a new answer. */
export function AgentTranscript({ messages, locale }: { messages: AgentConversation["messages"]; locale?: LocaleRuntime }) {
  const historyLabel = frontendText(locale, "AGENT_HISTORY");
  return <section aria-label={historyLabel} className="space-y-3">
    <h2>{historyLabel}</h2>
    <p className="text-sm text-muted-foreground">{frontendText(locale, "AGENT_HISTORY_DETAIL")}</p>
    <MessageScroller label={historyLabel} className="min-h-0" viewportClassName="h-80 lg:h-96" contentClassName="space-y-4 p-2">
      {messages.map((message, index) => {
        const question = message.role === "user";
        const roleName = frontendText(locale, question ? "AGENT_QUESTION_LABEL" : "AGENT_HISTORY_ANSWER");
        return <Message key={`${index}-${message.role}`} from={question ? "user" : "assistant"} aria-label={roleName}>
          <MessageContent>
            <MessageHeader><h3 className="font-medium">{roleName}</h3></MessageHeader>
            <MessageBubble variant={question ? "tint" : "soft"}>
              <MessageBubbleContent><p className="whitespace-pre-wrap">{message.content}</p></MessageBubbleContent>
            </MessageBubble>
            {message.citations.length > 0 && <MessageFooter>{message.citations.map((citation) => <a key={citation.id} className="mr-3 underline" href={citation.href}>{citation.title ?? citation.id}</a>)}</MessageFooter>}
          </MessageContent>
        </Message>;
      })}
    </MessageScroller>
  </section>;
}
