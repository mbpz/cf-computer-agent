import { describe, expect, it } from "vitest";
import { createAiAdapter } from "../../src/ai/client";

describe("Workers AI response adapter", () => {
  it("converts a chat completion into the legacy response string", async () => {
    const seen: Array<{ model: string; input: unknown }> = [];
    const adapter = createAiAdapter({
      async run(model, input) {
        seen.push({ model, input });
        return { choices: [{ message: { role: "assistant", content: "{\"ok\":true}" } }] };
      },
    });
    await expect(adapter.run("model-a", { messages: [] })).resolves.toEqual({ response: "{\"ok\":true}" });
    expect(seen).toEqual([{ model: "model-a", input: { messages: [] } }]);
  });

  it("passes legacy and streaming results through unchanged", async () => {
    const legacy = { response: "text", usage: { total_tokens: 1 } };
    const stream = new ReadableStream<Uint8Array>();
    const legacyAdapter = createAiAdapter({ async run() { return legacy; } });
    const streamAdapter = createAiAdapter({ async run() { return stream; } });
    await expect(legacyAdapter.run("m", {})).resolves.toBe(legacy);
    await expect(streamAdapter.run("m", { stream: true })).resolves.toBe(stream);
  });

  it("does not invent a response when the completion carries no text", async () => {
    const raw = { choices: [{ message: { role: "assistant", content: null } }] };
    const adapter = createAiAdapter({ async run() { return raw; } });
    await expect(adapter.run("m", {})).resolves.toBe(raw);
  });
});
