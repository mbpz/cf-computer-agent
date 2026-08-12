import type { AccessIdentity } from "../identity/access-jwt";
import { canonicalizeEmail } from "../identity/access-jwt";
import { AppError } from "../http";
import { MembersConflictError, type MembersRepositoryPort } from "./repository";
import type { CreateMember, Member, MemberStatus } from "./types";

export interface MembersEnvironment {
  BOOTSTRAP_ADMIN_EMAIL?: string;
}

export interface MembersServiceOptions {
  id?: () => string;
  now?: () => Date;
  lastSeenWindowMs?: number;
  waitUntil?: (promise: Promise<unknown>) => void;
}

const defaultLastSeenWindowMs = 60_000;

export class MembersService {
  private readonly id: () => string;
  private readonly now: () => Date;
  private readonly lastSeenWindowMs: number;
  private readonly waitUntil: ((promise: Promise<unknown>) => void) | undefined;

  constructor(
    private readonly repository: MembersRepositoryPort,
    environment: MembersEnvironment = {},
    options: MembersServiceOptions = {},
  ) {
    this.bootstrapAdminEmail = canonicalizeEmail(environment.BOOTSTRAP_ADMIN_EMAIL);
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
    this.lastSeenWindowMs = options.lastSeenWindowMs ?? defaultLastSeenWindowMs;
    this.waitUntil = options.waitUntil;
  }

  private readonly bootstrapAdminEmail: string | undefined;

  async resolveFirstLogin(identity: AccessIdentity): Promise<Member> {
    const existing = await this.repository.findByAccessSub(identity.sub);
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
    if (target.role !== "contributor") throw new AppError("FORBIDDEN", "Administrators cannot be modified", 403);
    const updated = await this.repository.updateContributorStatus(memberId, status, this.now().toISOString());
    if (!updated) throw new AppError("FORBIDDEN", "Administrators cannot be modified", 403);
    return updated;
  }

  private async insertWithConflictRecovery(identity: AccessIdentity, role: "admin" | "contributor"): Promise<Member> {
    try {
      return await this.resolveExisting(await this.repository.insert(this.newMember(identity, role)));
    } catch (error) {
      if (!(error instanceof MembersConflictError)) throw error;
      if (error.kind === "access_sub") {
        const bySubject = await this.repository.findByAccessSub(identity.sub);
        if (bySubject) return this.resolveExisting(bySubject);
        throw new AppError("MEMBER_CONFLICT", "Member login conflicted", 409, true);
      }
      if (role !== "admin") throw error;
    }

    const bySubject = await this.repository.findByAccessSub(identity.sub);
    if (bySubject) return this.resolveExisting(bySubject);
    if (role !== "admin") throw new AppError("MEMBER_CONFLICT", "Member login conflicted", 409, true);

    try {
      return await this.resolveExisting(await this.repository.insert(this.newMember(identity, "contributor")));
    } catch (error) {
      if (!(error instanceof MembersConflictError)) throw error;
      if (error.kind !== "access_sub") throw error;
      const retriedSubject = await this.repository.findByAccessSub(identity.sub);
      if (retriedSubject) return this.resolveExisting(retriedSubject);
      throw new AppError("MEMBER_CONFLICT", "Member login conflicted", 409, true);
    }
  }

  private newMember(identity: AccessIdentity, role: "admin" | "contributor"): CreateMember {
    const now = this.now().toISOString();
    return {
      id: this.id(),
      accessSub: identity.sub,
      email: identity.email,
      role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
  }

  private async resolveExisting(member: Member): Promise<Member> {
    if (member.status !== "active") throw new AppError("MEMBER_DISABLED", "Member access is disabled", 403);
    const now = this.now();
    const staleBefore = new Date(now.getTime() - this.lastSeenWindowMs).toISOString();
    const update = this.repository.touchLastSeenIfStale(member.id, now.toISOString(), staleBefore)
      .then(() => undefined)
      .catch(() => { console.warn("member last_seen update failed"); });
    if (this.waitUntil) this.waitUntil(update);
    else await update;
    return member;
  }
}
