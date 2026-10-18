// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiRequestError, type Fetcher } from "../../frontend/lib/api";
import { adminMemberInvitationFailure, issueAdminMemberInvitation, loadAdminMemberInvitations, revokeAdminMemberInvitation } from "../../frontend/lib/admin-member-invitations-data";

const invitation = { id: "i1", email: "new@example.test", status: "pending", createdAt: "2026-10-11T00:00:00.000Z", expiresAt: "2026-10-12T00:00:00.000Z" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function requester(body: unknown, status = 200) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetchStub: Fetcher = (path, init) => { calls.push({ path: String(path), init }); return Promise.resolve(jsonResponse(body, status)); };
  return { calls, fetchStub };
}

describe("admin member invitation data", () => {
  it("loads and validates the invitation list", async () => {
    const { fetchStub } = requester({ items: [invitation] });
    await expect(loadAdminMemberInvitations(fetchStub)).resolves.toEqual([invitation]);
  });

  it("rejects a list item that leaks the one-time code or drifts from the contract", async () => {
    await expect(loadAdminMemberInvitations(requester({ items: [{ ...invitation, code: "LEAK" }] }).fetchStub)).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(loadAdminMemberInvitations(requester({ items: [{ ...invitation, extra: 1 }] }).fetchStub)).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    const { createdAt: _createdAt, ...missing } = invitation;
    await expect(loadAdminMemberInvitations(requester({ items: [missing] }).fetchStub)).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(loadAdminMemberInvitations(requester({ items: [{ ...invitation, status: "expired" }] }).fetchStub)).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(loadAdminMemberInvitations(requester({ items: [invitation, invitation] }).fetchStub)).rejects.toThrow("INVITATION_RESPONSE_INVALID");
  });

  it("posts the exact issue body and returns the authorization grant", async () => {
    const { calls, fetchStub } = requester({ invitation }, 201);
    await expect(issueAdminMemberInvitation("new@example.test", fetchStub)).resolves.toEqual(invitation);
    expect(calls[0]!.path).toBe("/api/admin/member-invitations");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ email: "new@example.test" }));
  });

  it("rejects an issue response with extra fields or a non-pending invitation", async () => {
    await expect(issueAdminMemberInvitation("new@example.test", requester({ invitation, code: "LEAK" }).fetchStub)).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(issueAdminMemberInvitation("new@example.test", requester({ invitation: { ...invitation, status: "revoked" } }).fetchStub)).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(issueAdminMemberInvitation("new@example.test", requester({ invitation, extra: 1 }).fetchStub)).rejects.toThrow("INVITATION_RESPONSE_INVALID");
  });

  it("revokes by id and requires the trimmed revoked receipt", async () => {
    const receipt = { id: "i1", email: "new@example.test", status: "revoked" };
    const { calls, fetchStub } = requester({ invitation: receipt });
    await expect(revokeAdminMemberInvitation("i1", fetchStub)).resolves.toEqual(receipt);
    expect(calls[0]!.path).toBe("/api/admin/member-invitations/i1/revoke");
    expect(calls[0]!.init?.method).toBe("POST");
    await expect(revokeAdminMemberInvitation("i1", requester({ invitation: { ...receipt, status: "pending" } }).fetchStub)).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(revokeAdminMemberInvitation("i1", requester({ invitation: { ...receipt, id: "i2" } }).fetchStub)).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(revokeAdminMemberInvitation("i1", requester({ invitation: { ...receipt, createdAt: "x" } }).fetchStub)).rejects.toThrow("INVITATION_RESPONSE_INVALID");
  });

  it("maps documented error codes to distinct outcomes", () => {
    expect(adminMemberInvitationFailure(new ApiRequestError("INVITATION_REQUEST_INVALID", "", 400, false))).toBe("invalid");
    expect(adminMemberInvitationFailure(new ApiRequestError("INVITATION_ALREADY_PENDING", "", 409, false))).toBe("already_pending");
    expect(adminMemberInvitationFailure(new ApiRequestError("INVITATION_ADMIN_EMAIL", "", 409, false))).toBe("admin_email");
    expect(adminMemberInvitationFailure(new ApiRequestError("INVITATION_NOT_FOUND", "", 404, false))).toBe("not_found");
    expect(adminMemberInvitationFailure(new ApiRequestError("INVITATION_NOT_PENDING", "", 409, false))).toBe("not_pending");
    expect(adminMemberInvitationFailure(new ApiRequestError("API_ERROR", "", 403, false))).toBe("forbidden");
    expect(adminMemberInvitationFailure(new Error("network"))).toBe("unknown");
  });
});
