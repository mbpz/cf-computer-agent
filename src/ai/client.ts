export interface AiBindingLike {
  run(model: string, input: unknown): Promise<unknown>;
}

interface ChatCompletionEnvelope {
  choices?: unknown;
}

/**
 * Normalizes Workers AI responses to the legacy `{ response: string }` shape the
 * services parse. Newer chat models answer with an OpenAI chat-completion
 * envelope while the original text-generation models answered with `response`;
 * keeping the adapter here avoids teaching every service both shapes.
 *
 * Streaming results and non-chat results pass through untouched.
 */
export function createAiAdapter(ai: AiBindingLike): AiBindingLike {
  return {
    async run(model, input) {
      const result = await ai.run(model, input);
      if (result === null || typeof result !== "object") return result;
      const choices = (result as ChatCompletionEnvelope).choices;
      if (!Array.isArray(choices) || choices.length === 0) return result;
      const message = (choices[0] as { message?: unknown } | undefined)?.message;
      const content = (message as { content?: unknown } | undefined)?.content;
      return typeof content === "string" ? { response: content } : result;
    },
  };
}
