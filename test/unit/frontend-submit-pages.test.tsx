// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SubmitPage } from "../../frontend/pages/submit-page";
import { MySubmissionsPage } from "../../frontend/pages/my-submissions-page";
import { createIdempotencyKey, validateSubmissionDraft } from "../../frontend/components/submissions/submission-form-model";
import { assetStatusModel } from "../../frontend/components/assets/asset-state";

describe("React submission and asset pages", () => {
  it("validates bounded text/code drafts and creates nonempty idempotency keys", () => {
    expect(validateSubmissionDraft({ mode: "text", title: "", content: "" })).toMatchObject({ ok: false, field: "title" });
    expect(validateSubmissionDraft({ mode: "code", title: "Guide", content: "const x = 1;" })).toEqual({ ok: true });
    expect(validateSubmissionDraft({ mode: "text", title: "Guide", content: "x".repeat(131073) })).toMatchObject({ ok: false, field: "content" });
    expect(createIdempotencyKey()).toMatch(/^[A-Za-z0-9_-]{16,}$/u);
  });

  it("renders submit mode and validation error without leaking undefined", () => {
    const html = renderToStaticMarkup(<SubmitPage draft={{ mode: "markdown", title: "Guide", content: "# Heading" }} state={{ kind: "idle" }} />);
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
});
