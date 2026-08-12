import { describe, expect, it, vi } from "vitest";
import type { AccessIdentity } from "../../src/identity/access-jwt";
import { MembersService } from "../../src/members/service";
import type { Member, MemberStatus } from "../../src/members/types";
import type { MembersRepositoryPort } from "../../src/members/repository";

const identity: AccessIdentity = { sub: "access-subject", email: "member@example.test" };

describe("MembersService", () => {
  it("bootstraps the canonical configured address as the first active admin", async () => {
    const repository = new FakeMembersRepository();
    const service = createService(repository, { BOOTSTRAP_ADMIN_EMAIL: "  ADMIN@EXAMPLE.TEST " });

    await expect(service.resolveFirstLogin({ ...identity, email: "admin@example.test" })).resolves.toMatchObject({
      role: "admin", status: "active", email: "admin@example.test",
    });
    expect(repository.members).toHaveLength(1);
  });

  it("creates a normal first login as an active contributor", async () => {
    const repository = new FakeMembersRepository();
    const service = createService(repository, { BOOTSTRAP_ADMIN_EMAIL: "admin@example.test" });

    await expect(service.resolveFirstLogin(identity)).resolves.toMatchObject({ role: "contributor", status: "active" });
  });

  it("does not promote a matching member after an admin already exists", async () => {
    const repository = new FakeMembersRepository([member({ role: "admin" })]);
    const service = createService(repository, { BOOTSTRAP_ADMIN_EMAIL: "member@example.test" });

    await expect(service.resolveFirstLogin(identity)).resolves.toMatchObject({ role: "contributor" });
  });

  it("fails closed for a disabled existing member", async () => {
    const repository = new FakeMembersRepository([member({ accessSub: identity.sub, status: "disabled" })]);
    const service = createService(repository);

    await expect(service.resolveFirstLogin(identity)).rejects.toMatchObject({ code: "MEMBER_DISABLED", status: 403 });
  });

  it("allows an admin to change a contributor but never an admin", async () => {
    const admin = member({ id: "admin", role: "admin" });
    const contributor = member({ id: "contributor", role: "contributor" });
    const protectedAdmin = member({ id: "protected-admin", role: "admin" });
    const repository = new FakeMembersRepository([admin, contributor, protectedAdmin]);
    const service = createService(repository);

    await expect(service.setContributorStatus(admin, contributor.id, "disabled"))
      .resolves.toMatchObject({ id: contributor.id, status: "disabled" });
    await expect(service.setContributorStatus(admin, protectedAdmin.id, "disabled"))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(repository.findById(protectedAdmin.id)).resolves.toMatchObject({ status: "active" });
  });

  it("does not write last_seen again inside the configured window", async () => {
    const now = new Date("2026-08-12T12:00:00.000Z");
    const existing = member({ accessSub: identity.sub, lastSeenAt: "2026-08-12T11:59:30.000Z" });
    const repository = new FakeMembersRepository([existing]);
    const service = createService(repository, {}, { now: () => now, lastSeenWindowMs: 60_000 });

    await expect(service.resolveFirstLogin(identity)).resolves.toMatchObject({ id: existing.id });
    expect(repository.touchLastSeenIfStale).toHaveBeenCalledWith(existing.id, now.toISOString(), "2026-08-12T11:59:00.000Z");
  });

  it("returns an authenticated active member when the best-effort last_seen write fails", async () => {
    const existing = member({ accessSub: identity.sub });
    const repository = new FakeMembersRepository([existing]);
    repository.touchLastSeenIfStale.mockRejectedValueOnce(new Error("D1 write unavailable"));
    const service = createService(repository);

    await expect(service.resolveFirstLogin(identity)).resolves.toMatchObject({ id: existing.id });
  });

  it("propagates an arbitrary D1 insert failure without creating an account", async () => {
    const repository = new FakeMembersRepository();
    repository.insert = async () => { throw new Error("D1 unavailable"); };
    const service = createService(repository);

    await expect(service.resolveFirstLogin(identity)).rejects.toThrow("D1 unavailable");
    expect(repository.members).toEqual([]);
  });
});

function createService(
  repository: FakeMembersRepository,
  environment: { BOOTSTRAP_ADMIN_EMAIL?: string } = {},
  options: { now?: () => Date; lastSeenWindowMs?: number } = {},
): MembersService {
  return new MembersService(repository, environment, { id: () => "new-member", ...options });
}

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    accessSub: "existing-access-subject",
    email: "member@example.test",
    role: "contributor",
    status: "active",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    lastSeenAt: null,
    ...overrides,
  };
}

class FakeMembersRepository implements MembersRepositoryPort {
  readonly members: Member[];
  readonly touchLastSeenIfStale = vi.fn(async () => false);

  constructor(members: Member[] = []) {
    this.members = [...members];
  }

  async findByAccessSub(accessSub: string): Promise<Member | null> {
    return this.members.find((candidate) => candidate.accessSub === accessSub) ?? null;
  }

  async findById(id: string): Promise<Member | null> {
    return this.members.find((candidate) => candidate.id === id) ?? null;
  }

  async hasActiveAdmin(): Promise<boolean> {
    return this.members.some((candidate) => candidate.role === "admin" && candidate.status === "active");
  }

  async insert(input: Omit<Member, "lastSeenAt">): Promise<Member> {
    const created = { ...input, lastSeenAt: null };
    if (this.members.some((candidate) => candidate.accessSub === created.accessSub)) throw new Error("UNIQUE constraint failed: members.access_sub");
    if (created.role === "admin" && await this.hasActiveAdmin()) throw new Error("UNIQUE constraint failed: members.role");
    this.members.push(created);
    return created;
  }

  async list(): Promise<{ items: Member[]; nextCursor?: string }> {
    return { items: [...this.members] };
  }

  async updateContributorStatus(id: string, status: MemberStatus): Promise<Member | null> {
    const existing = await this.findById(id);
    if (!existing || existing.role !== "contributor") return null;
    const updated = { ...existing, status };
    this.members.splice(this.members.indexOf(existing), 1, updated);
    return updated;
  }
}
