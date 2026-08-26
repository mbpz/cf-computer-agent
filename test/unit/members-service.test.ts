import { describe, expect, it, vi } from "vitest";
import type { CreateAuditEvent } from "../../src/audit/types";
import type { GitHubIdentity } from "../../src/identity/github-oauth";
import type { WeChatIdentity } from "../../src/identity/wechat-oauth";
import { MembersConflictError, type MembersRepositoryPort } from "../../src/members/repository";
import { MembersService, type MembersEnvironment, type MembersServiceOptions } from "../../src/members/service";
import type { CreateMember, Member, MemberStatus } from "../../src/members/types";

const githubIdentity: GitHubIdentity = {
  subject: "github:123",
  githubUserId: "123",
  email: "member@example.test",
};
const githubEnvironment: MembersEnvironment = {
  BOOTSTRAP_ADMIN_EMAIL: "admin@example.test",
  ALLOWED_MEMBER_EMAILS: "admin@example.test, member@example.test",
};

describe("MembersService GitHub login", () => {
  it.each([
    ["absent", { BOOTSTRAP_ADMIN_EMAIL: "member@example.test" }],
    ["empty", { BOOTSTRAP_ADMIN_EMAIL: "member@example.test", ALLOWED_MEMBER_EMAILS: "" }],
    ["empty entry", { BOOTSTRAP_ADMIN_EMAIL: "member@example.test", ALLOWED_MEMBER_EMAILS: "member@example.test," }],
    ["invalid entry", { BOOTSTRAP_ADMIN_EMAIL: "member@example.test", ALLOWED_MEMBER_EMAILS: "not-an-email" }],
    ["empty domain label", {
      BOOTSTRAP_ADMIN_EMAIL: "admin@example.test",
      ALLOWED_MEMBER_EMAILS: "admin@example.test,member@example..test",
    }],
    ["duplicate entry", {
      BOOTSTRAP_ADMIN_EMAIL: "member@example.test",
      ALLOWED_MEMBER_EMAILS: "member@example.test, MEMBER@EXAMPLE.TEST",
    }],
    ["bootstrap outside the allowlist", {
      BOOTSTRAP_ADMIN_EMAIL: "admin@example.test",
      ALLOWED_MEMBER_EMAILS: "member@example.test",
    }],
  ])("fails closed for %s allowlist configuration", async (_label, environment) => {
    const repository = new FakeMembersRepository();

    await expect(createService(repository, environment).resolveGitHubLogin(githubIdentity))
      .rejects.toMatchObject({ code: "OAUTH_CONFIG_INVALID", status: 503 });
    expect(repository.members).toEqual([]);
    expect(repository.linkCalls).toEqual([]);
  });

  it("denies a verified GitHub email that is not allowlisted", async () => {
    const repository = new FakeMembersRepository();

    await expect(createService(repository, githubEnvironment).resolveGitHubLogin({
      ...githubIdentity,
      email: "outsider@example.test",
    })).rejects.toMatchObject({ code: "MEMBER_NOT_ALLOWED", status: 403 });
    expect(repository.members).toEqual([]);
  });

  it("creates an allowlisted first login as an active contributor", async () => {
    const repository = new FakeMembersRepository();

    await expect(createService(repository, githubEnvironment).resolveGitHubLogin(githubIdentity)).resolves.toMatchObject({
      identitySubject: githubIdentity.subject,
      email: githubIdentity.email,
      role: "contributor",
      status: "active",
    });
    expect(repository.members).toHaveLength(1);
  });

  it("creates only the configured allowlisted bootstrap address as the first active admin", async () => {
    const repository = new FakeMembersRepository();
    const service = createService(repository, {
      BOOTSTRAP_ADMIN_EMAIL: "  ADMIN@EXAMPLE.TEST ",
      ALLOWED_MEMBER_EMAILS: " member@example.test, ADMIN@EXAMPLE.TEST ",
    });

    await expect(service.resolveGitHubLogin({ ...githubIdentity, email: "admin@example.test" })).resolves.toMatchObject({
      role: "admin", status: "active", email: "admin@example.test",
    });
    await expect(service.resolveGitHubLogin({
      ...githubIdentity,
      subject: "github:124",
      githubUserId: "124",
    })).resolves.toMatchObject({ role: "contributor" });
    expect(repository.members.filter((candidate) => candidate.role === "admin")).toHaveLength(1);
  });

  it("fails closed for a disabled member already linked to the GitHub subject", async () => {
    const repository = new FakeMembersRepository([
      member({ identitySubject: githubIdentity.subject, status: "disabled" }),
    ]);

    await expect(createService(repository, githubEnvironment).resolveGitHubLogin(githubIdentity))
      .rejects.toMatchObject({ code: "MEMBER_DISABLED", status: 403 });
  });

  it("atomically links the sole exact canonical-email member without changing authorization fields", async () => {
    const existing = member({
      id: "legacy-member",
      identitySubject: "legacy-access-subject",
      email: "  MEMBER@EXAMPLE.TEST ",
      role: "admin",
      status: "active",
    });
    const repository = new FakeMembersRepository([existing]);
    const now = new Date("2026-08-19T12:00:00.000Z");

    await expect(createService(repository, {
      BOOTSTRAP_ADMIN_EMAIL: "member@example.test",
      ALLOWED_MEMBER_EMAILS: "member@example.test",
    }, { now: () => now }).resolveGitHubLogin(githubIdentity)).resolves.toMatchObject({
      id: existing.id,
      identitySubject: githubIdentity.subject,
      email: existing.email,
      role: existing.role,
      status: existing.status,
      createdAt: existing.createdAt,
      updatedAt: now.toISOString(),
    });
    expect(repository.members).toHaveLength(1);
    expect(repository.linkCalls).toEqual([expect.objectContaining({
      memberId: existing.id,
      expectedSubject: "legacy-access-subject",
      newSubject: githubIdentity.subject,
      audit: expect.objectContaining({
        actorKind: "member",
        actorId: existing.id,
        action: "member.identity_linked",
        resourceType: "member",
        resourceId: existing.id,
        metadata: { provider: "github" },
      }),
    })]);
    const auditOnly = repository.linkCalls.map(({ audit }) => audit);
    expect(JSON.stringify(auditOnly)).not.toMatch(/member@example|github:123|"123"/i);
  });

  it("fails closed when canonical email resolves to multiple legacy rows", async () => {
    const repository = new FakeMembersRepository([
      member({ id: "legacy-1", identitySubject: "access-1" }),
      member({ id: "legacy-2", identitySubject: "access-2", email: " MEMBER@EXAMPLE.TEST " }),
    ]);

    await expect(createService(repository, githubEnvironment).resolveGitHubLogin(githubIdentity))
      .rejects.toMatchObject({ code: "MEMBER_IDENTITY_CONFLICT", status: 409 });
    expect(repository.linkCalls).toEqual([]);
    expect(repository.members.map((candidate) => candidate.identitySubject)).toEqual(["access-1", "access-2"]);
  });

  it("fails closed when a classified subject conflict cannot be recovered by exact subject", async () => {
    const existing = member({ identitySubject: "legacy-access-subject" });
    const repository = new FakeMembersRepository([existing]);
    repository.linkIdentityWithAudit = async () => {
      throw new MembersConflictError("identity_subject");
    };

    await expect(createService(repository, githubEnvironment).resolveGitHubLogin(githubIdentity))
      .rejects.toMatchObject({ code: "MEMBER_IDENTITY_CONFLICT", status: 409 });
    expect(repository.members).toEqual([existing]);
  });

  it("preserves the disabled outcome when a member is disabled after lookup but before identity linking", async () => {
    const existing = member({ identitySubject: "legacy-access-subject" });
    const repository = new FakeMembersRepository([existing]);
    repository.linkIdentityWithAudit = async () => {
      const disabled = { ...existing, status: "disabled" as const };
      repository.members.splice(0, 1, disabled);
      return null;
    };

    await expect(createService(repository, githubEnvironment).resolveGitHubLogin(githubIdentity))
      .rejects.toMatchObject({ code: "MEMBER_DISABLED", status: 403 });
    expect(repository.members).toEqual([expect.objectContaining({
      identitySubject: "legacy-access-subject",
      status: "disabled",
    })]);
  });

  it("never creates or links a member after an arbitrary repository read error", async () => {
    const repository = new FakeMembersRepository();
    repository.findByIdentitySubject = async () => { throw new Error("D1 unavailable"); };

    await expect(createService(repository, githubEnvironment).resolveGitHubLogin(githubIdentity))
      .rejects.toThrow("D1 unavailable");
    expect(repository.members).toEqual([]);
    expect(repository.linkCalls).toEqual([]);
  });

  it("never recovers an arbitrary identity-link error as a successful login", async () => {
    const existing = member({ identitySubject: "legacy-access-subject" });
    const repository = new FakeMembersRepository([existing]);
    repository.linkIdentityWithAudit = async () => { throw new Error("UNIQUE constraint failed: members.id"); };

    await expect(createService(repository, githubEnvironment).resolveGitHubLogin(githubIdentity))
      .rejects.toThrow("UNIQUE constraint failed: members.id");
    expect(repository.members).toEqual([existing]);
  });

  it("never recovers an arbitrary insert error as a GitHub account", async () => {
    const repository = new FakeMembersRepository();
    repository.insert = async () => { throw new Error("D1 insert unavailable"); };

    await expect(createService(repository, githubEnvironment).resolveGitHubLogin(githubIdentity))
      .rejects.toThrow("D1 insert unavailable");
    expect(repository.members).toEqual([]);
    expect(repository.linkCalls).toEqual([]);
  });
});

describe("MembersService WeChat login", () => {
  const identity: WeChatIdentity = { subject: "wechat:union-123", openId: "open-123", unionId: "union-123" };

  it("creates only an allowlisted WeChat subject and bootstraps its first admin", async () => {
    const repository = new FakeMembersRepository();
    const service = createService(repository, {
      BOOTSTRAP_WECHAT_SUBJECT: identity.subject,
      ALLOWED_WECHAT_SUBJECTS: identity.subject,
    });
    await expect(service.resolveWeChatLogin(identity)).resolves.toMatchObject({ role: "admin", identitySubject: identity.subject, email: "union-123@wechat.invalid" });
    await expect(service.resolveWeChatLogin({ ...identity, subject: "wechat:outside-123" })).rejects.toMatchObject({ code: "MEMBER_NOT_ALLOWED", status: 403 });
  });
});

describe("MembersService member lifecycle", () => {
  it("requires a lifecycle sink for last_seen work", () => {
    const repository = new FakeMembersRepository();

    expect(() => new MembersService(repository, {}, {} as MembersServiceOptions)).toThrow("waitUntil is required");
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
      .rejects.toMatchObject({ code: "ADMIN_PROTECTED", status: 403 });
    await expect(repository.findById(protectedAdmin.id)).resolves.toMatchObject({ status: "active" });
  });

  it("does not block authorization on the best-effort last_seen write", async () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    const existing = member({ identitySubject: githubIdentity.subject, lastSeenAt: "2026-08-19T11:59:30.000Z" });
    const repository = new FakeMembersRepository([existing]);
    const pending = new Promise<never>(() => undefined);
    let scheduled: Promise<unknown> | undefined;
    repository.touchLastSeenIfStale.mockReturnValueOnce(pending);
    const service = createService(repository, githubEnvironment, {
      now: () => now,
      lastSeenWindowMs: 60_000,
      waitUntil: (promise) => { scheduled = promise; },
    });

    await expect(service.resolveGitHubLogin(githubIdentity)).resolves.toMatchObject({ id: existing.id });
    expect(repository.touchLastSeenIfStale).toHaveBeenCalledWith(
      existing.id,
      now.toISOString(),
      "2026-08-19T11:59:00.000Z",
    );
    expect(scheduled).toBeDefined();
  });

  it("returns an active member when a handled last_seen write rejects", async () => {
    const existing = member({ identitySubject: githubIdentity.subject });
    const repository = new FakeMembersRepository([existing]);
    repository.touchLastSeenIfStale.mockRejectedValueOnce(new Error("D1 write unavailable"));
    let scheduled: Promise<unknown> | undefined;
    const service = createService(repository, githubEnvironment, { waitUntil: (promise) => { scheduled = promise; } });

    await expect(service.resolveGitHubLogin(githubIdentity)).resolves.toMatchObject({ id: existing.id });
    await expect(scheduled).resolves.toBeUndefined();
  });

  it("does not recover an unrelated unique-constraint insert error as a member race", async () => {
    const repository = new FakeMembersRepository();
    repository.insert = async () => { throw new Error("UNIQUE constraint failed: members.id"); };

    await expect(createService(repository, githubEnvironment).resolveGitHubLogin(githubIdentity))
      .rejects.toThrow("UNIQUE constraint failed: members.id");
    expect(repository.members).toEqual([]);
  });
});

function createService(
  repository: FakeMembersRepository,
  environment: MembersEnvironment = {},
  options: Partial<MembersServiceOptions> = {},
): MembersService {
  return new MembersService(repository, environment, {
    id: () => `new-member-${repository.members.length + 1}`,
    auditId: () => `audit-${repository.linkCalls.length + 1}`,
    waitUntil: () => undefined,
    ...options,
  });
}

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    identitySubject: "existing-identity-subject",
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
  readonly linkCalls: Array<{
    memberId: string;
    expectedSubject: string;
    newSubject: string;
    updatedAt: string;
    audit: CreateAuditEvent;
  }> = [];

  constructor(members: Member[] = []) {
    this.members = [...members];
  }

  async findByIdentitySubject(subject: string): Promise<Member | null> {
    return this.members.find((candidate) => candidate.identitySubject === subject) ?? null;
  }

  async findByCanonicalEmail(email: string, limit: 2): Promise<Member[]> {
    return this.members
      .filter((candidate) => candidate.email.trim().toLowerCase() === email)
      .slice(0, limit);
  }

  async findById(id: string): Promise<Member | null> {
    return this.members.find((candidate) => candidate.id === id) ?? null;
  }

  async hasActiveAdmin(): Promise<boolean> {
    return this.members.some((candidate) => candidate.role === "admin" && candidate.status === "active");
  }

  async insert(input: CreateMember): Promise<Member> {
    const created = { ...input, lastSeenAt: null };
    if (this.members.some((candidate) => candidate.identitySubject === created.identitySubject)) {
      throw new MembersConflictError("identity_subject");
    }
    if (created.role === "admin" && await this.hasActiveAdmin()) {
      throw new MembersConflictError("active_admin");
    }
    this.members.push(created);
    return created;
  }

  async linkIdentityWithAudit(
    memberId: string,
    expectedSubject: string,
    newSubject: string,
    updatedAt: string,
    audit: CreateAuditEvent,
  ): Promise<Member | null> {
    this.linkCalls.push({ memberId, expectedSubject, newSubject, updatedAt, audit });
    if (this.members.some((candidate) => candidate.identitySubject === newSubject)) {
      throw new MembersConflictError("identity_subject");
    }
    const existing = this.members.find((candidate) => (
      candidate.id === memberId && candidate.identitySubject === expectedSubject
    ));
    if (!existing) return null;
    const linked = { ...existing, identitySubject: newSubject, updatedAt };
    this.members.splice(this.members.indexOf(existing), 1, linked);
    return linked;
  }

  async listPage(): Promise<{ items: Member[]; nextCursor?: string }> {
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
