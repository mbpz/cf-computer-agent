import type { GitHubIdentity } from "../identity/github-oauth";
import { canonicalizeEmail } from "../identity/access-jwt";
import { AppError } from "../http";
import { MembersConflictError, type MembersRepositoryPort } from "./repository";
import type { CreateMember, Member, MemberIdentity, MemberStatus } from "./types";

export interface MembersEnvironment {
  BOOTSTRAP_ADMIN_EMAIL?: string;
  ALLOWED_MEMBER_EMAILS?: string;
}

export interface MembersServiceOptions {
  id?: () => string;
  auditId?: () => string;
  now?: () => Date;
  lastSeenWindowMs?: number;
  waitUntil: (promise: Promise<unknown>) => void;
}

const defaultLastSeenWindowMs = 60_000;

export class MembersService {
  private readonly id: () => string;
  private readonly now: () => Date;
  private readonly auditId: () => string;
  private readonly lastSeenWindowMs: number;
  private readonly waitUntil: (promise: Promise<unknown>) => void;
  private readonly bootstrapAdminEmail: string | undefined;
  private readonly allowedMemberEmails: string | undefined;

  constructor(
    private readonly repository: MembersRepositoryPort,
    environment: MembersEnvironment = {},
    options: MembersServiceOptions,
  ) {
    if (typeof options.waitUntil !== "function") throw new TypeError("waitUntil is required");
    this.bootstrapAdminEmail = canonicalizeEmail(environment.BOOTSTRAP_ADMIN_EMAIL);
    this.allowedMemberEmails = environment.ALLOWED_MEMBER_EMAILS;
    this.id = options.id || (() => crypto.randomUUID());
    this.auditId = options.auditId || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
    this.lastSeenWindowMs = options.lastSeenWindowMs ?? defaultLastSeenWindowMs;
    this.waitUntil = options.waitUntil;
  }

  async resolveGitHubLogin(input: GitHubIdentity): Promise<Member> {
    const allowedEmails = parseAllowedMemberEmails(this.allowedMemberEmails, this.bootstrapAdminEmail);
    const identity = githubMemberIdentity(input);
    if (!allowedEmails.has(identity.email)) {
      throw new AppError("MEMBER_NOT_ALLOWED", "Member access is not allowed", 403);
    }

    const bySubject = await this.repository.findByIdentitySubject(identity.identitySubject);
    if (bySubject) return this.resolveExisting(bySubject);

    const byEmail = await this.repository.findByCanonicalEmail(identity.email, 2);
    if (byEmail.length > 1) throw identityConflict();
    if (byEmail.length === 1) return this.linkExistingIdentity(byEmail[0]!, identity);

    const hasActiveAdmin = await this.repository.hasActiveAdmin();
    const role = !hasActiveAdmin && this.bootstrapAdminEmail === identity.email ? "admin" : "contributor";
    return this.insertWithConflictRecovery(identity, role);
  }

  // Transitional provider-neutral seam retained until the Access principal is removed.
  async resolveFirstLogin(identity: MemberIdentity): Promise<Member> {
    const existing = await this.repository.findByIdentitySubject(identity.identitySubject);
    if (existing) return this.resolveExisting(existing);

    const hasActiveAdmin = await this.repository.hasActiveAdmin();
    const role = !hasActiveAdmin && this.bootstrapAdminEmail === identity.email ? "admin" : "contributor";
    return this.insertWithConflictRecovery(identity, role);
  }

  async setContributorStatus(actor: Member, memberId: string, status: MemberStatus): Promise<Member> {
    if (actor.role !== "admin" || actor.status !== "active") {
      throw new AppError("FORBIDDEN", "Administrator access required", 403);
    }
    const target = await this.repository.findById(memberId);
    if (!target) throw new AppError("MEMBER_NOT_FOUND", "Member not found", 404);
    if (target.role !== "contributor") throw new AppError("ADMIN_PROTECTED", "Administrators cannot be modified", 403);
    const now = this.now().toISOString();
    const updated = this.repository.updateContributorStatusWithAudit
      ? await this.repository.updateContributorStatusWithAudit(memberId, status, now, {
        id: this.auditId(), actorKind: "member", actorId: actor.id, action: "member.status_updated",
        resourceType: "member", resourceId: memberId,
        metadata: { previousStatus: target.status, newStatus: status }, createdAt: now,
      })
      : await this.repository.updateContributorStatus(memberId, status, now);
    if (!updated) throw new AppError("ADMIN_PROTECTED", "Administrators cannot be modified", 403);
    return updated;
  }

  private async linkExistingIdentity(existing: Member, identity: MemberIdentity): Promise<Member> {
    requireActive(existing);
    const updatedAt = this.now().toISOString();
    let linked: Member | null;
    try {
      linked = await this.repository.linkIdentityWithAudit(
        existing.id,
        existing.identitySubject,
        identity.identitySubject,
        updatedAt,
        {
          id: this.auditId(),
          actorKind: "member",
          actorId: existing.id,
          action: "member.identity_linked",
          resourceType: "member",
          resourceId: existing.id,
          metadata: { provider: "github" },
          createdAt: updatedAt,
        },
      );
    } catch (error) {
      if (!(error instanceof MembersConflictError) || error.kind !== "identity_subject") throw error;
      return this.resolveConcurrentIdentityLink(existing.id, identity.identitySubject);
    }
    if (!linked) return this.resolveConcurrentIdentityLink(existing.id, identity.identitySubject);
    return this.resolveExisting(linked);
  }

  private async resolveConcurrentIdentityLink(memberId: string, subject: string): Promise<Member> {
    const bySubject = await this.repository.findByIdentitySubject(subject);
    if (!bySubject || bySubject.id !== memberId) throw identityConflict();
    return this.resolveExisting(bySubject);
  }

  private async insertWithConflictRecovery(
    identity: MemberIdentity,
    role: "admin" | "contributor",
  ): Promise<Member> {
    try {
      return await this.resolveExisting(await this.insertMember(identity, role));
    } catch (error) {
      if (!(error instanceof MembersConflictError)) throw error;
      if (error.kind === "identity_subject") {
        const bySubject = await this.repository.findByIdentitySubject(identity.identitySubject);
        if (bySubject) return this.resolveExisting(bySubject);
        throw identityConflict();
      }
      if (role !== "admin") throw error;
    }

    const bySubject = await this.repository.findByIdentitySubject(identity.identitySubject);
    if (bySubject) return this.resolveExisting(bySubject);
    if (role !== "admin") throw identityConflict();

    try {
      return await this.resolveExisting(await this.insertMember(identity, "contributor"));
    } catch (error) {
      if (!(error instanceof MembersConflictError)) throw error;
      if (error.kind !== "identity_subject") throw error;
      const retriedSubject = await this.repository.findByIdentitySubject(identity.identitySubject);
      if (retriedSubject) return this.resolveExisting(retriedSubject);
      throw identityConflict();
    }
  }

  private async insertMember(identity: MemberIdentity, role: "admin" | "contributor"): Promise<Member> {
    const member = this.newMember(identity, role);
    if (!this.repository.insertWithAudit) return this.repository.insert(member);
    return this.repository.insertWithAudit(member, {
      id: this.auditId(), actorKind: "member", actorId: member.id, action: "member.login",
      resourceType: "member", resourceId: member.id, metadata: { role }, createdAt: member.createdAt,
    });
  }

  private newMember(identity: MemberIdentity, role: "admin" | "contributor"): CreateMember {
    const now = this.now().toISOString();
    return {
      id: this.id(),
      identitySubject: identity.identitySubject,
      email: identity.email,
      role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
  }

  private async resolveExisting(member: Member): Promise<Member> {
    requireActive(member);
    const now = this.now();
    const staleBefore = new Date(now.getTime() - this.lastSeenWindowMs).toISOString();
    const update = this.repository.touchLastSeenIfStale(member.id, now.toISOString(), staleBefore)
      .then(() => undefined)
      .catch(() => { console.warn("member last_seen update failed"); });
    this.waitUntil(update);
    return member;
  }
}

function parseAllowedMemberEmails(input: string | undefined, bootstrapEmail: string | undefined): ReadonlySet<string> {
  if (typeof input !== "string") throw oauthConfigurationInvalid();
  const allowed = new Set<string>();
  for (const entry of input.split(",")) {
    const email = canonicalEmail(entry);
    if (!email || allowed.has(email)) throw oauthConfigurationInvalid();
    allowed.add(email);
  }
  if (allowed.size === 0 || !bootstrapEmail || !allowed.has(bootstrapEmail)) throw oauthConfigurationInvalid();
  return allowed;
}

function githubMemberIdentity(identity: GitHubIdentity): MemberIdentity {
  const email = canonicalEmail(identity.email);
  if (!email
    || identity.email !== email
    || !/^github:[1-9]\d*$/u.test(identity.subject)
    || !/^[1-9]\d*$/u.test(identity.githubUserId)
    || identity.subject !== `github:${identity.githubUserId}`) {
    throw new AppError("OAUTH_IDENTITY_INVALID", "GitHub identity is invalid", 401);
  }
  return { identitySubject: identity.subject, email };
}

function canonicalEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !/^[\x21-\x7e]+$/u.test(email)) return undefined;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@") || at === email.length - 1 || at > 64) return undefined;
  const domain = email.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return undefined;
  return email;
}

function requireActive(member: Member): void {
  if (member.status !== "active") throw new AppError("MEMBER_DISABLED", "Member access is disabled", 403);
}

function oauthConfigurationInvalid(): AppError {
  return new AppError("OAUTH_CONFIG_INVALID", "GitHub authentication is not configured", 503);
}

function identityConflict(): AppError {
  return new AppError("MEMBER_IDENTITY_CONFLICT", "Member identity conflicted", 409);
}
