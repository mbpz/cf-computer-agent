// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MySubmissionsPage } from "../../frontend/pages/my-submissions-page";
import { createIdempotencyKey, validateSubmissionDraft } from "../../frontend/components/submissions/submission-form-model";
import { assetStatusModel } from "../../frontend/components/assets/asset-state";
import { assetUploadModel, clipboardImageFiles, displayRelativePath } from "../../frontend/components/assets/asset-upload-model";
import { createAssetUploadQueue } from "../../frontend/components/assets/asset-upload-queue";
import { SubmitPage } from "../../frontend/pages/submit-page";

describe("React submission and asset pages", () => {
  it("fails closed without a secure random source instead of returning a shared zero key", () => {
    vi.stubGlobal("crypto", undefined);
    try { expect(() => createIdempotencyKey()).toThrow("SUBMISSION_RANDOM_UNAVAILABLE"); }
    finally { vi.unstubAllGlobals(); }
  });
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

  it("keeps one titled h1 above the form in every submission state", () => {
    const draft = { mode: "text" as const, title: "", content: "" };
    for (const state of [
      { kind: "idle" as const },
      { kind: "pending" as const },
      { kind: "validation" as const, message: "Title is required." },
      { kind: "error" as const, message: "Submission failed." },
      { kind: "success" as const, message: "Submission received." },
    ]) {
      const html = renderToStaticMarkup(<SubmitPage draft={draft} state={state} />);
      expect((html.match(/<h1/g) ?? []).length).toBe(1);
      expect(html).toMatch(/<h1[^>]*>Submit knowledge<\/h1>/u);
      expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("<form"));
    }
    // The unresolved-write recovery surface is the one state that adds its own
    // heading: the page header still opens the page above it.
    const recovery = renderToStaticMarkup(<SubmitPage draft={draft} state={{ kind: "idle" }} recovery={{ title: "Unresolved draft", storageUnavailable: false, invalid: false, onRetry: () => undefined }} />);
    expect((recovery.match(/<h1/g) ?? []).length).toBe(1);
    expect(recovery.indexOf("<h1")).toBeLessThan(recovery.indexOf("Unresolved draft"));
    expect(recovery).toContain('aria-describedby="submission-description"');
  });

  it("maps asset parser lifecycle states", () => {
    expect(assetStatusModel({ status: "queued" })).toMatchObject({ tone: "info", label: "Queued" });
    expect(assetStatusModel({ status: "failed_terminal", lastErrorCode: "SOURCE_UNSUPPORTED" })).toMatchObject({ tone: "destructive", retryable: false });
  });

  it("offers resubmission only for a returned row whose own source is readable", () => {
    const source = { kind: "markdown" as const, content: "# Body", target: { requestedSpaceId: "space-a", requestedCollectionId: null, requestedVisibility: "shared" as const } };
    const page = (items: { id: string; title: string; status: string; source?: typeof source }[]) => ({ kind: "ready" as const, items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: 1 } });
    const returned = renderToStaticMarkup(<MySubmissionsPage state={page([{ id: "s1", title: "Guide", status: "revision_requested", source }])} onResubmit={() => undefined} />);
    expect(returned).toContain("revision_requested");
    expect(returned).toContain("Resubmit");
    expect(returned).toContain("data-my-submission-resubmit=");
    // A row that was not returned for changes, or whose own source cannot be read, offers no action.
    expect(renderToStaticMarkup(<MySubmissionsPage state={page([{ id: "s2", title: "Guide", status: "needs_revision" }])} onResubmit={() => undefined} />)).not.toContain("data-my-submission-resubmit=");
    expect(renderToStaticMarkup(<MySubmissionsPage state={page([{ id: "s3", title: "Guide", status: "revision_requested" }])} onResubmit={() => undefined} />)).toContain("data-my-submission-resubmit-unavailable");
    // A row the member already resubmitted is marked from the server's own supersede link.
    const superseded = renderToStaticMarkup(<MySubmissionsPage state={page([{ id: "s1", title: "Guide", status: "revision_requested", source }])} onResubmit={() => undefined} resubmitted={[{ priorId: "s1", submissionId: "s9" }]} />);
    expect(superseded).toContain("data-my-submission-resubmitted");
    expect(superseded).not.toContain("data-my-submission-resubmit=");
    // A storage failure while opening the editor is reported instead of silently ignored.
    expect(renderToStaticMarkup(<MySubmissionsPage state={page([{ id: "s1", title: "Guide", status: "revision_requested", source }])} resubmitError="This browser cannot record the resubmission identity." />)).toContain("data-my-submissions-resubmit-error");
  });

  it("tells the visitor where the draft lives and shows a returned submission in context", () => {
    const draft = { mode: "markdown" as const, title: "Guide", content: "# Body" };
    const saved = renderToStaticMarkup(<SubmitPage draft={draft} state={{ kind: "idle" }} draftSave={{ kind: "saved", at: "2026-10-16T09:00:00.000Z" }} />);
    expect(saved).toContain('data-submission-draft-status="saved"');
    expect(saved).toContain("Draft saved to the server");
    const unsaved = renderToStaticMarkup(<SubmitPage draft={draft} state={{ kind: "idle" }} draftSave={{ kind: "unconfirmed", reason: "no_target" }} />);
    expect(unsaved).toContain('data-submission-draft-status="unconfirmed"');
    expect(unsaved).toContain("Not saved to the server yet: choose a destination.");
    expect(unsaved).not.toContain("Draft saved to the server");

    const resubmitting = renderToStaticMarkup(<SubmitPage draft={draft} state={{ kind: "idle" }}
      resubmit={{ priorId: "prior-1", title: "Returned guide", reviewNote: "Add sources.", state: "editing", statusRead: "none" }}
      comments={{ state: { kind: "ready", comments: [{ id: "c1", authorRole: "admin", body: "Add sources.", createdAt: "2026-10-16T09:00:00.000Z" }] }, onRetry: () => undefined }} />);
    expect(resubmitting).toContain("Resubmit for review");
    expect(resubmitting).toContain("Returned for changes");
    expect(resubmitting).toContain('data-submission-resubmit="editing"');
    expect(resubmitting).toContain("Add sources.");
    expect(resubmitting).toContain('data-submission-comments="ready"');
    expect((resubmitting.match(/<h1/g) ?? []).length).toBe(1);

    const submitted = renderToStaticMarkup(<SubmitPage draft={draft} state={{ kind: "idle" }}
      resubmit={{ priorId: "prior-1", title: "Revised guide", state: "submitted", submissionId: "submission-new", status: "review_pending", statusRead: "found" }} />);
    expect(submitted).toContain('data-submission-resubmit-status="found"');
    expect(submitted).toContain("review_pending");
    expect(submitted).not.toContain("Resubmit for review");
  });

  it("renders an owner-safe review reason and note without internal metadata", () => {
    const html = renderToStaticMarkup(<MySubmissionsPage state={{ kind: "ready", items: [{
      id: "s2",
      title: "Duplicate guide",
      status: "rejected",
      review: { decision: "rejected", reasonCode: "duplicate", note: "已有正式条目" },
    }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }} />);
    expect(html).toContain("Review reason");
    expect(html).toContain("Duplicate");
    expect(html).toContain("Reviewer note");
    expect(html).toContain("已有正式条目");
    expect(html).not.toContain("data-pagination-desktop");
    expect(html).not.toContain("data-pagination-mobile");
    expect(html).toContain("Review reason");
    expect(html).not.toContain("undefined");
    const paged = renderToStaticMarkup(<MySubmissionsPage state={{ kind: "ready", items: [{ id: "s2", title: "Duplicate guide", status: "rejected" }], pagination: { page: 1, pageSize: 20, total: 40, totalPages: 2 } }} pagination={{ page: 1, pageSize: 20, total: 40, totalPages: 2 }} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} onLoadMore={vi.fn()} />);
    expect(paged).toContain("data-pagination-desktop");
    expect(paged).toContain("1–20");
    expect(html).not.toContain("reviewerId");
  });

  it("renders advisory similar-source suggestions without exposing similarity internals", () => {
    const html = renderToStaticMarkup(<SubmitPage draft={{ mode: "markdown", title: "Guide", content: "Body" }} state={{ kind: "success", message: "Submitted", similarCandidates: [{ submissionId: "submission-1", sourceId: "source-1", sourceVersionId: "version-1", title: "Existing guide", similarity: 0.72 }] }} />);
    expect(html).toContain("Similar entries found");
    expect(html).toContain("Existing guide");
    expect(html).not.toContain("0.72");
    expect(html).not.toContain("undefined");
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

  it("publishes independent progress snapshots and never replays a queue run", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const upload = vi.fn(async () => { await gate; });
    const onChange = vi.fn();
    const queue = createAssetUploadQueue(["a"], upload, { onChange });
    const first = queue.run();
    const second = queue.run();
    await Promise.resolve();
    expect(upload).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalled();
    const processing = onChange.mock.calls[0]![0];
    expect(processing[0].status).toBe("processing");
    release();
    await Promise.all([first, second]);
    await queue.run();
    expect(upload).toHaveBeenCalledOnce();
    expect(processing[0].status).toBe("processing");
    expect(onChange.mock.calls.at(-1)![0][0].status).toBe("succeeded");
    expect(onChange.mock.calls.at(-1)![0]).not.toBe(processing);
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
