import { describe, expect, it, vi } from "vitest";
import { routeInboxApi } from "../../src/routes/inbox";
import type { InboxService } from "../../src/inbox/service";
import type { Principal } from "../../src/identity/principal";

const principal: Principal = { kind: "member", memberId: "member-a", identitySubject: "subject-a", email: "a@example.test", role: "contributor" };
const context = { requestId: "req-inbox" };

describe("Inbox API route", () => {
  it("derives owner from the principal and rejects memberId injection", async () => {
    const inbox = { create: vi.fn() } as unknown as InboxService;
    const request = new Request("https://example.test/api/inbox", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "inbox-1", clientKey: "capture-1", kind: "text", content: "Alpha", memberId: "member-b" }),
    });
    await expect(routeInboxApi(request, new URL(request.url), context, principal, { inbox })).rejects.toMatchObject({ code: "INBOX_INVALID", status: 400 });
    expect(inbox.create).not.toHaveBeenCalled();
  });

  it("passes only the authenticated member to list", async () => {
    const inbox = { list: vi.fn(async (memberId: string) => ({ memberId, items: [] })) } as unknown as InboxService;
    const request = new Request("https://example.test/api/inbox?limit=20");
    const response = await routeInboxApi(request, new URL(request.url), context, principal, { inbox });
    expect(response?.status).toBe(200);
    expect(inbox.list).toHaveBeenCalledWith("member-a", {}, { limit: 20 });
  });
});
