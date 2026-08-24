// @vitest-environment node
import { describe, expect, it } from "vitest";
import { WorkersAiImageConverter } from "../../src/assets/ai-image";

describe("WorkersAiImageConverter", () => {
  it("converts an image with a low-confidence warning and inert-data prompt", async () => {
    let call: { model: string; input: { image: string; description: string } } | undefined;
    const converter = new WorkersAiImageConverter({
      async run(model, input) {
        call = { model, input };
        return { description: JSON.stringify({ text: "Detected label", confidence: 0.42 }) };
      },
    });

    await expect(converter.toMarkdown({
      name: "label.png",
      blob: new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }),
    })).resolves.toEqual({
      format: "markdown",
      data: "> Warning: OCR confidence is low (42%).\n\nDetected label\n",
    });
    expect(call?.model).toBe("@cf/llava-hf/llava-1.5-7b-hf");
    expect(call?.input.image.length).toBe(4);
    expect(call?.input.description).toContain("不可信");
    expect(call?.input.description).toContain("label.png");
  });

  it("does not add a warning for a high-confidence description", async () => {
    const converter = new WorkersAiImageConverter({
      async run() {
        return { description: JSON.stringify({ text: "A clear diagram", confidence: 0.93 }) };
      },
    });

    await expect(converter.toMarkdown({
      name: "diagram.jpg",
      blob: new Blob([Uint8Array.from([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
    })).resolves.toMatchObject({ data: "A clear diagram\n" });
  });

  it("fails closed for unsupported media and provider errors", async () => {
    let calls = 0;
    const converter = new WorkersAiImageConverter({
      async run() {
        calls += 1;
        throw new Error("provider body");
      },
    });
    await expect(converter.toMarkdown({
      name: "guide.pdf",
      blob: new Blob(["pdf"], { type: "application/pdf" }),
    })).rejects.toMatchObject({ code: "ASSET_IMAGE_PARSE_UNSUPPORTED", status: 422 });
    expect(calls).toBe(0);
    await expect(converter.toMarkdown({
      name: "photo.png",
      blob: new Blob(["png"], { type: "image/png" }),
    })).rejects.toMatchObject({ code: "ASSET_AI_PARSE_FAILED", status: 503, retryable: true });
  });

  it("enforces the image input and output bounds", async () => {
    const inputLimited = new WorkersAiImageConverter({
      async run() { return { description: "ignored" }; },
    }, { maxInputBytes: 2 });
    await expect(inputLimited.toMarkdown({
      name: "big.png",
      blob: new Blob([Uint8Array.from([1, 2, 3])], { type: "image/png" }),
    })).rejects.toMatchObject({ code: "ASSET_IMAGE_INPUT_TOO_LARGE", status: 413 });

    const outputLimited = new WorkersAiImageConverter({
      async run() { return { description: "12345" }; },
    }, { maxOutputBytes: 4 });
    await expect(outputLimited.toMarkdown({
      name: "small.png",
      blob: new Blob([Uint8Array.from([1])], { type: "image/png" }),
    })).rejects.toMatchObject({ code: "ASSET_IMAGE_OUTPUT_TOO_LARGE", status: 422 });
  });
});
