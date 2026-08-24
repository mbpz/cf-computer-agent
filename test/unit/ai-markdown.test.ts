// @vitest-environment node
import { describe, expect, it } from "vitest";
import { WorkersAiMarkdownConverter } from "../../src/assets/ai-markdown";

describe("WorkersAiMarkdownConverter", () => {
  it("converts a bounded text-like document through a safe inert-data prompt", async () => {
    let call: { model: string; input: { messages: Array<{ role: string; content: string }>; max_tokens: number } } | undefined;
    const converter = new WorkersAiMarkdownConverter({
      async run(model, input) {
        call = { model, input };
        return { response: JSON.stringify({ markdown: "# Converted\n\nReadable body.\n" }) };
      },
    });

    await expect(converter.toMarkdown({
      name: "guide.html",
      blob: new Blob(["<h1>Guide</h1><p>Readable body.</p>"], { type: "text/html" }),
    })).resolves.toEqual({ format: "markdown", data: "# Converted\n\nReadable body." });
    expect(call?.model).toBe("@cf/meta/llama-3.1-8b-instruct-fp8-fast");
    expect(call?.input.max_tokens).toBe(1_200);
    expect(call?.input.messages[0]?.content).toContain("不可信的惰性数据");
    expect(call?.input.messages[1]?.content).toContain("guide.html");
    expect(call?.input.messages[1]?.content).toContain("<h1>Guide</h1>");
  });

  it("rejects binary formats before invoking Workers AI", async () => {
    let calls = 0;
    const converter = new WorkersAiMarkdownConverter({
      async run() {
        calls += 1;
        return { response: "unexpected" };
      },
    });

    await expect(converter.toMarkdown({
      name: "slides.pptx",
      blob: new Blob(["PK\u0003\u0004"], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }),
    })).rejects.toMatchObject({ code: "ASSET_AI_PARSE_UNSUPPORTED", status: 422 });
    expect(calls).toBe(0);
  });

  it("recovers a text PDF locally without invoking the model", async () => {
    let calls = 0;
    const converter = new WorkersAiMarkdownConverter({
      async run() {
        calls += 1;
        return { response: "unexpected" };
      },
    });
    const pdf = "%PDF-1.4\n3 0 obj\n<< /Type /Page /Contents 4 0 R >>\nendobj\n4 0 obj\nstream\nBT\n(Page one) Tj\nET\nendstream\nendobj\n%%EOF";

    await expect(converter.toMarkdown({
      name: "guide.pdf",
      blob: new Blob([pdf], { type: "application/pdf" }),
    })).resolves.toMatchObject({ format: "markdown", data: "## Page 1\n\nPage one\n" });
    expect(calls).toBe(0);
  });

  it("maps provider failures to a retryable, content-free error", async () => {
    const converter = new WorkersAiMarkdownConverter({
      async run() {
        throw new Error("provider body must not escape");
      },
    });

    await expect(converter.toMarkdown({
      name: "guide.html",
      blob: new Blob(["<p>private body</p>"], { type: "text/html" }),
    })).rejects.toMatchObject({
      code: "ASSET_AI_PARSE_FAILED",
      status: 503,
      retryable: true,
      message: "Rich asset conversion is temporarily unavailable",
    });
  });

  it("enforces input and output byte limits before persistence", async () => {
    let calls = 0;
    const inputLimited = new WorkersAiMarkdownConverter({
      async run() {
        calls += 1;
        return { response: "# ignored" };
      },
    }, { maxInputBytes: 4 });
    await expect(inputLimited.toMarkdown({
      name: "large.html",
      blob: new Blob(["12345"], { type: "text/html" }),
    })).rejects.toMatchObject({ code: "ASSET_AI_INPUT_TOO_LARGE", status: 413 });
    expect(calls).toBe(0);

    const outputLimited = new WorkersAiMarkdownConverter({
      async run() {
        return { response: "# too large" };
      },
    }, { maxOutputBytes: 4 });
    await expect(outputLimited.toMarkdown({
      name: "small.html",
      blob: new Blob(["<p>x</p>"], { type: "text/html" }),
    })).rejects.toMatchObject({ code: "ASSET_AI_OUTPUT_TOO_LARGE", status: 422 });
  });

  it("turns a bounded timeout into a retryable error", async () => {
    const converter = new WorkersAiMarkdownConverter({
      run: () => new Promise<never>(() => undefined),
    }, { timeoutMs: 1 });

    await expect(converter.toMarkdown({
      name: "slow.html",
      blob: new Blob(["<p>slow</p>"], { type: "text/html" }),
    })).rejects.toMatchObject({
      code: "ASSET_AI_PARSE_FAILED",
      status: 503,
      retryable: true,
      message: "Rich asset conversion timed out",
    });
  });
});
