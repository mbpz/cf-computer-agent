// @vitest-environment node
import { describe, expect, it } from "vitest";
import { InvitationConflictError, type InvitationsRepositoryPort } from "../../src/invitations/repository";
import { InvitationsService } from "../../src/invitations/service";
import {
  formatInvitationCode,
  generateInvitationCode,
  invitationCodesMatch,
  normalizeInvitationCode,
  INVITATION_CODE_PATTERN,
  type Invitation,
  type InvitationFilter,
  type InvitationPage,
} from "../../src/invitations/types";
import type { NumberedPageRequest } from "../../src/pagination";

const NOW = new Date("2026-10-18T12:00:00.000Z");
const CODE_A = "ABCDEFGHJKLMNPQR";
const CODE_B = "23456789ABCDEFGH";
const CODE_C = "JKLMNPQRSTUVWXYZ";

describe("invitation codes", () => {
  it("normalizes pasted input and formats stored codes for display", () => {
    expect(normalizeInvitationCode(" abcd-efgh-jklm-npqr ")).toBe(CODE_A);
    expect(normalizeInvitationCode("ABCD EFGH JKLM NPQR")).toBe(CODE_A);
    expect(normalizeInvitationCode(CODE_A.toLowerCase())).toBe(CODE_A);
    for (const invalid of ["", "ABCD", "ABCDEFGHIJKLMNOP", "ABCDEFGHJKLMNOP0", "ABCDEFGHJKLMNOP1", "ABCD-EFGH-IJKL-MNOP"]) {
      expect(normalizeInvitationCode(invalid), invalid).toBeNull();
    }
  });

  it("formats 16 canonical characters as four groups", () => {
    expect(formatInvitationCode(CODE_A)).toBe("ABCD-EFGH-JKLM-NPQR");
    expect(formatInvitationCode("not-a-code")).toBe("not-a-code");
  });

  it("generates unbiased, distinct canonical codes", () => {
    const codes = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const code = generateInvitationCode();
      expect(code).toMatch(INVITATION_CODE_PATTERN);
      codes.add(code);
    }
    expect(codes.size).toBe(200);
  });

  it("compares codes in constant time", () => {
    expect(invitationCodesMatch(CODE_A, CODE_A)).toBe(true);
    expect(invitationCodesMatch(CODE_A, CODE_B)).toBe(false);
    expect(invitationCodesMatch(CODE_A, CODE_A.slice(0, 15))).toBe(false);
    expect(invitationCodesMatch("", "")).toBe(true);
  });
});

describe("invitations service", () => {
  it("creates the member's lifetime code once and then returns it", async () => {
    const repository = new MemoryRepository();
    const service = serviceWith(repository);
    const first = await service.ensureMemberInvitation("member-1", NOW);
    expect(first.created).toBe(true);
    expect(first.invitation).toMatchObject({ code: CODE_A, status: "unused", bound: false, usedAt: null, createdAt: NOW.toISOString() });
    expect(first.invitation.formattedCode).toBe("ABCD-EFGH-JKLM-NPQR");
    expect(repository.records[0]).toMatchObject({
      kind: "member",
      ownerMemberId: "member-1",
      createdByMemberId: "member-1",
      status: "unused",
    });

    const second = await service.ensureMemberInvitation("member-1", NOW);
    expect(second.created).toBe(false);
    expect(second.invitation.code).toBe(CODE_A);
    expect(repository.records).toHaveLength(1);
    expect(repository.inserts).toBe(1);

    // A consumed code is still returned to its owner, frozen as used.
    repository.records[0] = {
      ...repository.records[0]!,
      status: "used",
      boundMemberId: "member-2",
      usedAt: "2026-10-18T12:05:00.000Z",
    };
    const used = await service.ensureMemberInvitation("member-1", NOW);
    expect(used.created).toBe(false);
    expect(used.invitation).toMatchObject({ code: CODE_A, status: "used", bound: true, usedAt: "2026-10-18T12:05:00.000Z" });
    expect(repository.inserts).toBe(1);
  });

  it("retries a colliding code and converges on a fresh one", async () => {
    const repository = new CollidingRepository(2);
    const codes = [CODE_A, CODE_B, CODE_C];
    let generated = 0;
    const service = new InvitationsService(repository, {
      id: () => `invitation-${repository.inserts + 1}`,
      code: () => codes[generated++]!,
      now: () => NOW,
    });

    const result = await service.ensureMemberInvitation("member-1", NOW);
    expect(result.created).toBe(true);
    expect(result.invitation.code).toBe(CODE_C);
    expect(generated).toBe(3);
    expect(repository.records).toHaveLength(1);
  });

  it("returns the winner's code when losing the owner unique race", async () => {
    const repository = new OwnerRaceRepository();
    const service = serviceWith(repository);
    const result = await service.ensureMemberInvitation("member-1", NOW);
    expect(result.created).toBe(false);
    expect(result.invitation.code).toBe(repository.winner.code);
    expect(repository.records).toHaveLength(0);
  });

  it("fails after bounded collisions", async () => {
    const repository = new CollidingRepository(99);
    const service = new InvitationsService(repository, {
      code: () => CODE_A,
      codeAttempts: 3,
    });
    await expect(service.ensureMemberInvitation("member-1", NOW)).rejects.toThrow("did not converge");
    expect(repository.inserts).toBe(3);
  });

  it("generates 1-20 administrator codes and rejects other counts", async () => {
    const repository = new MemoryRepository();
    const service = serviceWith(repository);
    await expect(service.generateAdminInvitations("admin-1", 0, NOW)).rejects.toMatchObject({
      code: "INVITATION_REQUEST_INVALID",
      status: 400,
    });
    await expect(service.generateAdminInvitations("admin-1", 21, NOW)).rejects.toMatchObject({ code: "INVITATION_REQUEST_INVALID" });
    await expect(service.generateAdminInvitations("admin-1", 1.5, NOW)).rejects.toMatchObject({ code: "INVITATION_REQUEST_INVALID" });

    const created = await service.generateAdminInvitations("admin-1", 3, NOW);
    expect(created).toHaveLength(3);
    expect(created.map((invitation) => invitation.kind)).toEqual(["admin", "admin", "admin"]);
    expect(created.map((invitation) => invitation.status)).toEqual(["unused", "unused", "unused"]);
    expect(created.every((invitation) => invitation.ownerMemberId === null && invitation.ownerEmail === null)).toBe(true);
    expect(created.every((invitation) => invitation.formattedCode === formatInvitationCode(invitation.code))).toBe(true);
    expect(created.every((invitation) => invitation.createdAt === NOW.toISOString())).toBe(true);
    expect(repository.records).toHaveLength(3);
    expect(repository.records.every((invitation) => invitation.createdByMemberId === "admin-1")).toBe(true);
  });

  it("delegates numbered pages with the requested filter", async () => {
    const repository = new MemoryRepository();
    const service = serviceWith(repository);
    const request: NumberedPageRequest = { page: 2, pageSize: 20 };
    const filter: InvitationFilter = { status: "used", kind: "member" };
    await expect(service.listPage(request, filter)).resolves.toMatchObject({
      items: [],
      pagination: { page: 2, pageSize: 20, total: 0, totalPages: 0 },
    });
    expect(repository.lastRequest).toEqual(request);
    expect(repository.lastFilter).toEqual(filter);
  });

  it("rejects an invalid clock", async () => {
    const service = serviceWith(new MemoryRepository());
    await expect(service.ensureMemberInvitation("member-1", new Date(Number.NaN))).rejects.toThrow("Invitation clock is invalid");
  });

  function serviceWith(repository: InvitationsRepositoryPort): InvitationsService {
    const codes = [CODE_A, CODE_B, CODE_C];
    let generated = 0;
    let ids = 0;
    return new InvitationsService(repository, {
      id: () => `invitation-${++ids}`,
      code: () => codes[generated++]!,
      now: () => NOW,
    });
  }
});

class MemoryRepository implements InvitationsRepositoryPort {
  records: Invitation[] = [];
  memberEmails = new Map<string, string>();
  inserts = 0;
  lastRequest: NumberedPageRequest | undefined;
  lastFilter: InvitationFilter | undefined;

  async findByOwnerMemberId(memberId: string): Promise<Invitation | null> {
    return this.records.find((invitation) => invitation.ownerMemberId === memberId) ?? null;
  }

  async findOwnedWithBoundEmail(memberId: string): Promise<{ invitation: Invitation; boundEmail: string | null } | null> {
    const invitation = await this.findByOwnerMemberId(memberId);
    if (!invitation) return null;
    return { invitation, boundEmail: invitation.boundMemberId === null ? null : this.memberEmails.get(invitation.boundMemberId) ?? null };
  }

  async findBoundByMemberId(memberId: string): Promise<Invitation | null> {
    return this.records.find((invitation) => invitation.boundMemberId === memberId) ?? null;
  }

  async insert(invitation: Invitation): Promise<Invitation> {
    this.inserts += 1;
    this.records.push(invitation);
    return invitation;
  }

  async listPage(request: NumberedPageRequest, filter?: InvitationFilter): Promise<InvitationPage> {
    this.lastRequest = request;
    this.lastFilter = filter;
    return {
      items: [],
      pagination: { page: request.page, pageSize: request.pageSize, total: 0, totalPages: 0 },
    };
  }
}

class CollidingRepository extends MemoryRepository {
  constructor(private collisions: number) {
    super();
  }

  override async insert(invitation: Invitation): Promise<Invitation> {
    if (this.collisions > 0) {
      this.collisions -= 1;
      this.inserts += 1;
      throw new InvitationConflictError("code");
    }
    return super.insert(invitation);
  }
}

class OwnerRaceRepository extends MemoryRepository {
  winner: Invitation = {
    id: "winner",
    code: CODE_C,
    kind: "member",
    ownerMemberId: "member-1",
    boundMemberId: null,
    status: "unused",
    createdByMemberId: "member-1",
    createdAt: NOW.toISOString(),
    usedAt: null,
  };
  private firstRead = true;

  override async findByOwnerMemberId(memberId: string): Promise<Invitation | null> {
    if (this.firstRead) {
      this.firstRead = false;
      return null;
    }
    return this.winner.ownerMemberId === memberId ? this.winner : null;
  }

  override async insert(): Promise<Invitation> {
    this.inserts += 1;
    throw new InvitationConflictError("owner");
  }
}
