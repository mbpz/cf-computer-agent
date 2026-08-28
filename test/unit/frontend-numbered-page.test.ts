import { describe, expect, it, vi } from "vitest";
import {
  createNumberedRequestController,
  normalizeNumberedPage,
  parsePageSearch,
  writePageSearch,
} from "../../frontend/lib/numbered-page";

describe("frontend numbered-page state", () => {
  it("parses exact supported URL state and falls back safely", () => {
    expect(parsePageSearch("?page=3&pageSize=50&q=worker")).toEqual({ page: 3, pageSize: 50 });
    expect(parsePageSearch("?page=0&pageSize=10")).toEqual({ page: 1, pageSize: 20 });
    expect(parsePageSearch("?page=2&page=3&pageSize=100")).toEqual({ page: 1, pageSize: 100 });
    expect(parsePageSearch("?page=101&pageSize=100")).toEqual({ page: 1, pageSize: 100 });
  });

  it("writes page state while preserving filters and omitting defaults", () => {
    expect(writePageSearch("?q=worker&page=3", { page: 1, pageSize: 100 })).toBe("?q=worker&pageSize=100");
    expect(writePageSearch("?tag=a&tag=b&page=4&pageSize=50", { page: 1, pageSize: 20 })).toBe("?tag=a&tag=b");
    expect(writePageSearch("?q=worker", { page: 2, pageSize: 20 })).toBe("?q=worker&page=2");
  });

  it("strictly normalizes a numbered response", () => {
    expect(normalizeNumberedPage(
      { items: [{ id: "a" }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
      (value) => {
        if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as { id?: unknown }).id !== "string") throw new Error("ITEM_INVALID");
        return { id: (value as { id: string }).id };
      },
    )).toEqual({ items: [{ id: "a" }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
  });

  it("requires a complete non-last page", () => {
    const truncated = { items: Array.from({ length: 19 }, (_, id) => ({ id })), pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } };
    expect(() => normalizeNumberedPage(truncated, (item) => item)).toThrow("NUMBERED_PAGE_RESPONSE_INVALID");
  });

  it("accepts the exact last-page item count", () => {
    const lastPage = { items: [{ id: "last" }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } };
    expect(normalizeNumberedPage(lastPage, (item) => item)).toEqual(lastPage);
  });

  it("accepts an empty legal page beyond the last page", () => {
    const beyondLast = { items: [], pagination: { page: 4, pageSize: 20, total: 21, totalPages: 2 } };
    expect(normalizeNumberedPage(beyondLast, (item) => item)).toEqual(beyondLast);
  });

  it.each([
    null,
    { items: [], pagination: null },
    { items: [], pagination: { page: 0, pageSize: 20, total: 0, totalPages: 0 } },
    { items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } },
    { items: [], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 1 } },
    { items: Array.from({ length: 21 }, (_, id) => ({ id })), pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } },
    { items: [{ id: "too-many" }, { id: "rows" }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } },
    { items: [{ id: "unexpected" }], pagination: { page: 2, pageSize: 20, total: 0, totalPages: 0 } },
    { items: [], pagination: { page: 101, pageSize: 100, total: 20_000, totalPages: 200 } },
  ])("rejects malformed numbered responses %#", (value) => {
    expect(() => normalizeNumberedPage(value, (item) => item)).toThrow("NUMBERED_PAGE_RESPONSE_INVALID");
  });

  it("aborts the previous request and identifies only the latest generation", async () => {
    const signals: AbortSignal[] = [];
    const requester = vi.fn((input: string, signal: AbortSignal) => {
      signals.push(signal);
      return Promise.resolve(input.toUpperCase());
    });
    const controller = createNumberedRequestController(requester);

    const first = controller.request("first");
    const second = controller.request("second");
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect(controller.isCurrent(first.generation)).toBe(false);
    expect(controller.isCurrent(second.generation)).toBe(true);
    await expect(second.promise).resolves.toBe("SECOND");

    controller.dispose();
    expect(signals[1]?.aborted).toBe(true);
    expect(controller.isCurrent(second.generation)).toBe(false);
    expect(() => controller.request("third")).toThrow("NUMBERED_REQUEST_CONTROLLER_DISPOSED");
  });
});
