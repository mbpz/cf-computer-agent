// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadDecisionReceipt } from "../../frontend/lib/admin-batch-review-data";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("loadDecisionReceipt", () => {
  it("uses the injected requester and accepts only the matching identity", async () => {
    const requester = vi.fn(async () => response({ submissionId: "sub-1", operationId: "op-1", receipt: { responseJson: "{}" } })) as unknown as typeof fetch;
    await expect(loadDecisionReceipt("sub-1", "op-1", requester)).resolves.toMatchObject({ found: true, responseJson: "{}" });
    expect(requester).toHaveBeenCalledTimes(1);
    const mismatch = vi.fn(async () => response({ submissionId: "sub-2", operationId: "op-1", receipt: { responseJson: "{}" } })) as unknown as typeof fetch;
    await expect(loadDecisionReceipt("sub-1", "op-1", mismatch)).rejects.toThrow("BATCH_RECEIPT_RESPONSE_INVALID");
  });

  it("turns only the explicit receipt-missing code into missing", async () => {
    const missing = vi.fn(async () => response({ error: { code: "REVIEW_RECEIPT_NOT_FOUND", message: "missing", retryable: false } }, 404)) as unknown as typeof fetch;
    await expect(loadDecisionReceipt("sub-1", "op-1", missing)).resolves.toMatchObject({ found: false });
    const generic = vi.fn(async () => response({ error: { code: "NOT_FOUND", message: "route missing", retryable: false } }, 404)) as unknown as typeof fetch;
    await expect(loadDecisionReceipt("sub-1", "op-1", generic)).rejects.toMatchObject({ status: 404 });
  });
});
