// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MySubmissionsPage } from "../../frontend/pages/my-submissions-page";
import { createIdempotencyKey, validateSubmissionDraft } from "../../frontend/components/submissions/submission-form-model";
import { assetStatusModel } from "../../frontend/components/assets/asset-state";
import { assetUploadModel, clipboardImageFiles, displayRelativePath } from "../../frontend/components/assets/asset-upload-model";
import { createAssetUploadQueue } from "../../frontend/components/assets/asset-upload-queue";
import { SubmitPage } from "../../frontend/pages/submit-page";

describe("React submission and asset pages", () => {
  it("validates bounded text/code drafts and creates nonempty idempotency keys", () => {
    expect(validateSubmissionDraft({ mode: "text", title: "", content: "" })).toMatchObject({ ok: false, field: "title" });
    expect(validateSubmissionDraft({ mode: "code", title: "Guide", content: "const x = 1;" })).toEqual({ ok: true });
    expect(validateSubmissionDraft({ mode: "text", title: "Guide", content: "x".repeat(131073) })).toMatchObject({ ok: false, field: "content" });
    expect(createIdempotencyKey()).toMatch(/^[A-Za-z0-9_-]{16,}$/u);
  });

  it("renders submit mode and validation error without leaking undefined", () => {
    const html = renderToStaticMarkup(<SubmitPage draft={{ mode: "markdown", title: "Guide", content: "# Heading" }} state={{ kind: "idle" }} />);
    expect(html).toContain("<form");
    expect(html).toContain('type="submit"');
    expect(html).toContain("Markdown");
    expect(html).toContain("Submit knowledge");
    expect(html).not.toContain("undefined");
    expect(renderToStaticMarkup(<SubmitPage draft={{ mode: "text", title: "", content: "" }} state={{ kind: "validation", message: "Title is required." }} />)).toContain("Title is required.");
  });

  it("maps asset parser lifecycle and resubmission states", () => {
    expect(assetStatusModel({ status: "queued" })).toMatchObject({ tone: "info", label: "Queued" });
    expect(assetStatusModel({ status: "failed_terminal", lastErrorCode: "SOURCE_UNSUPPORTED" })).toMatchObject({ tone: "destructive", retryable: false });
    const html = renderToStaticMarkup(<MySubmissionsPage state={{ kind: "ready", items: [{ id: "s1", title: "Guide", status: "needs_revision" }], nextCursor: null }} />);
    expect(html).toContain("Needs revision");
    expect(html).toContain("Resubmit");
  });

  it("renders an owner-safe review reason and note without internal metadata", () => {
    const html = renderToStaticMarkup(<MySubmissionsPage state={{ kind: "ready", items: [{
      id: "s2",
      title: "Duplicate guide",
      status: "rejected",
      review: { decision: "rejected", reasonCode: "duplicate", note: "已有正式条目" },
    }], nextCursor: null }} />);
    expect(html).toContain("Review reason");
    expect(html).toContain("Duplicate");
    expect(html).toContain("Reviewer note");
    expect(html).toContain("已有正式条目");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("reviewerId");
  });

  it("keeps the free-tier upload boundary explicit and validates enabled files", () => {
    expect(assetUploadModel({ enabled: false, maxBytes: 10, file: { name: "guide.pdf", size: 1 } })).toEqual({ kind: "disabled", reason: "OBJECT_STORAGE_UNAVAILABLE" });
    expect(assetUploadModel({ enabled: true, maxBytes: 10, file: { name: "", size: 1 } })).toEqual({ kind: "invalid", reason: "NAME_REQUIRED" });
    expect(assetUploadModel({ enabled: true, maxBytes: 10, file: { name: "guide.pdf", size: 11 } })).toEqual({ kind: "invalid", reason: "TOO_LARGE" });
    expect(assetUploadModel({ enabled: true, maxBytes: 10, file: { name: "guide.pdf", size: 10 } })).toEqual({ kind: "idle" });
    expect(assetUploadModel({ enabled: true, maxBytes: 10, file: { name: "guide.exe", size: 1 } })).toEqual({ kind: "invalid", reason: "TYPE_UNSUPPORTED" });
    expect(assetUploadModel({ enabled: true, maxBytes: 10, files: [{ name: "a.pdf", size: 1 }, { name: "b.pdf", size: 1 }] })).toEqual({ kind: "invalid", reason: "COUNT_EXCEEDED" });
  });

  it("keeps drag/drop paired with the keyboard file picker and accepted matrix", () => {
    const html = renderToStaticMarkup(<SubmitPage draft={{ mode: "markdown", title: "Title", content: "Body" }} state={{ kind: "idle" }} />);
    expect(html).toContain('data-drop-target="asset"');
    expect(html).toContain('accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.html,.xml,.odt,.ods,.png,.jpg,.jpeg,.gif,.webp"');
    expect(html).toContain('type="file"');
  });

  it("runs a bounded batch queue with isolated failures", async () => {
    let active = 0;
    let peak = 0;
    const queue = createAssetUploadQueue(["a", "b", "c", "d"], async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      if (value === "b") throw new Error("bad-file");
    }, { concurrency: 2 });
    const result = await queue.run();
    expect(peak).toBeLessThanOrEqual(2);
    expect(result.map((item) => item.status)).toEqual(["succeeded", "failed", "succeeded", "succeeded"]);
    expect(result[1]?.error).toBe("bad-file");
  });

  it("extracts clipboard images while ignoring pasted text and unsupported media", () => {
    const image = new File(["png"], "", { type: "image/png" });
    const files = clipboardImageFiles([
      { kind: "string", type: "text/plain" },
      { kind: "file", type: "image/png", getAsFile: () => image },
      { kind: "file", type: "image/svg+xml", getAsFile: () => new File(["svg"], "bad.svg", { type: "image/svg+xml" }) },
    ]);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: "clipboard-2.png", type: "image/png" });
  });

  it("keeps folder paths display-only and removes traversal/control segments", () => {
    expect(displayRelativePath({ name: "guide.md", webkitRelativePath: "docs/../private/guide.md" })).toBe("docs/private/guide.md");
    expect(displayRelativePath({ name: "guide.md", webkitRelativePath: "docs/\u0000guide.md" })).toBe("docs/_guide.md");
  });
});
