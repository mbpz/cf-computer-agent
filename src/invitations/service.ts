import { AppError } from "../http";
import type { NumberedPageRequest } from "../pagination";
import {
  InvitationConflictError,
  type InvitationsRepositoryPort,
} from "./repository";
import {
  formatInvitationCode,
  generateInvitationCode,
  INVITATION_GENERATE_MAX,
  INVITATION_GENERATE_MIN,
  isCanonicalInvitationCode,
  type Invitation,
  type InvitationFilter,
  type InvitationKind,
  type InvitationListItem,
  type InvitationNetwork,
  type InvitationNetworkNode,
  type InvitationPage,
  type BoundMemberInvitation,
  type MemberInvitation,
  type MemberInvitationsView,
} from "./types";

export interface InvitationsServiceOptions {
  id?: () => string;
  code?: () => string;
  now?: () => Date;
  /** Bounded retries when a random code collides with an existing row. */
  codeAttempts?: number;
}

const DEFAULT_CODE_ATTEMPTS = 8;

/**
 * Invitation lifecycle shared by registration and the two invitation surfaces.
 *
 * A member owns at most one `kind='member'` code for life: the first "my
 * invitation" request creates it, later requests return the same row (even
 * after it was consumed) and concurrent first requests converge on the
 * `invitations_member_owner_unique` index. Administrators generate any number
 * of `kind='admin'` codes, 1-20 per request.
 */
export class InvitationsService {
  private readonly id: () => string;
  private readonly code: () => string;
  private readonly now: () => Date;
  private readonly codeAttempts: number;

  constructor(
    private readonly repository: InvitationsRepositoryPort,
    options: InvitationsServiceOptions = {},
  ) {
    this.id = options.id || (() => crypto.randomUUID());
    this.code = options.code || generateInvitationCode;
    this.now = options.now || (() => new Date());
    this.codeAttempts = options.codeAttempts ?? DEFAULT_CODE_ATTEMPTS;
    if (!Number.isSafeInteger(this.codeAttempts) || this.codeAttempts < 1) {
      throw new TypeError("Invitation code attempts are invalid");
    }
  }

  /** Both codes the signed-in member may see: the one bound to their account
   * (used when they registered, or backfilled) and their own sharable code with
   * the email of the member who consumed it. */
  async findMemberInvitations(memberId: string): Promise<MemberInvitationsView> {
    const [owned, bound] = await Promise.all([
      this.repository.findOwnedWithBoundEmail(memberId),
      this.repository.findBoundByMemberId(memberId),
    ]);
    return {
      boundInvitation: bound ? boundMemberInvitationDto(bound) : null,
      invitation: owned ? memberInvitationDto(owned.invitation, owned.boundEmail) : null,
    };
  }

  async ensureMemberInvitation(
    memberId: string,
    now: Date = this.now(),
  ): Promise<{ invitation: MemberInvitation; created: boolean }> {
    const existing = await this.repository.findOwnedWithBoundEmail(memberId);
    if (existing) return { invitation: memberInvitationDto(existing.invitation, existing.boundEmail), created: false };
    const createdAt = timestamp(now);

    for (let attempt = 0; attempt < this.codeAttempts; attempt += 1) {
      const invitation = this.newInvitation({
        kind: "member",
        ownerMemberId: memberId,
        createdByMemberId: memberId,
        createdAt,
      });
      try {
        await this.repository.insert(invitation);
        return { invitation: memberInvitationDto(invitation, null), created: true };
      } catch (error) {
        if (!(error instanceof InvitationConflictError)) throw error;
        if (error.kind === "owner") {
          // A concurrent first request won the owner slot; return its code.
          const winner = await this.repository.findOwnedWithBoundEmail(memberId);
          if (winner) return { invitation: memberInvitationDto(winner.invitation, winner.boundEmail), created: false };
        }
        // A code collision is retried with a freshly generated code.
      }
    }
    throw new Error("Invitation code generation did not converge");
  }

  async generateAdminInvitations(adminMemberId: string, count: number, now: Date = this.now()): Promise<InvitationListItem[]> {
    if (!Number.isSafeInteger(count) || count < INVITATION_GENERATE_MIN || count > INVITATION_GENERATE_MAX) {
      throw new AppError(
        "INVITATION_REQUEST_INVALID",
        "Invitation count must be an integer from 1 to 20",
        400,
      );
    }
    const createdAt = timestamp(now);
    const invitations: InvitationListItem[] = [];
    for (let index = 0; index < count; index += 1) {
      invitations.push(adminInvitationDto(await this.insertAdminInvitation(adminMemberId, createdAt)));
    }
    return invitations;
  }

  listPage(request: NumberedPageRequest, filter?: InvitationFilter): Promise<InvitationPage> {
    return this.repository.listPage(request, filter);
  }

  /** The invitation-fission forest: members, their inviter and depth stats. */
  async network(): Promise<InvitationNetwork> {
    const nodes = await this.repository.network();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const children = new Map<string, InvitationNetworkNode[]>();
    const roots: InvitationNetworkNode[] = [];
    for (const node of nodes) {
      const inviter = node.inviterId !== null ? byId.get(node.inviterId) : undefined;
      // Missing inviters (deleted/FK anomaly) and self-links are roots, never a cycle.
      if (!inviter || inviter.id === node.id) roots.push(node);
      else children.set(inviter.id, [...(children.get(inviter.id) ?? []), node]);
    }
    const depthOf = new Map<string, number>();
    const visit = (node: InvitationNetworkNode, depth: number): void => {
      if (depthOf.has(node.id)) return;
      depthOf.set(node.id, depth);
      for (const child of children.get(node.id) ?? []) visit(child, depth + 1);
    };
    for (const root of roots) visit(root, 0);
    // Any node not reached from a root (a cycle in malformed data) contributes depth 0.
    for (const node of nodes) if (!depthOf.has(node.id)) visit(node, 0);
    return {
      nodes,
      stats: {
        members: nodes.length,
        invited: nodes.filter((node) => node.inviterId !== null && byId.has(node.inviterId) && node.inviterId !== node.id).length,
        roots: roots.length,
        maxDepth: Math.max(0, ...depthOf.values()),
      },
    };
  }

  private async insertAdminInvitation(adminMemberId: string, createdAt: string): Promise<Invitation> {
    for (let attempt = 0; attempt < this.codeAttempts; attempt += 1) {
      const invitation = this.newInvitation({
        kind: "admin",
        ownerMemberId: null,
        createdByMemberId: adminMemberId,
        createdAt,
      });
      try {
        await this.repository.insert(invitation);
        return invitation;
      } catch (error) {
        if (!(error instanceof InvitationConflictError) || error.kind !== "code") throw error;
      }
    }
    throw new Error("Invitation code generation did not converge");
  }

  private newInvitation(input: {
    kind: InvitationKind;
    ownerMemberId: string | null;
    createdByMemberId: string;
    createdAt: string;
  }): Invitation {
    const code = this.code();
    if (!isCanonicalInvitationCode(code)) {
      throw new Error("Invitation code generator returned a non-canonical code");
    }
    return {
      id: this.id(),
      code,
      kind: input.kind,
      ownerMemberId: input.ownerMemberId,
      boundMemberId: null,
      status: "unused",
      createdByMemberId: input.createdByMemberId,
      createdAt: input.createdAt,
      usedAt: null,
    };
  }
}

function timestamp(now: Date): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invitation clock is invalid");
  return now.toISOString();
}

function memberInvitationDto(invitation: Invitation, boundEmail: string | null): MemberInvitation {
  return {
    code: invitation.code,
    formattedCode: formatInvitationCode(invitation.code),
    status: invitation.status,
    createdAt: invitation.createdAt,
    usedAt: invitation.usedAt,
    bound: invitation.boundMemberId !== null,
    boundEmail: invitation.boundMemberId === null ? null : boundEmail,
  };
}

function boundMemberInvitationDto(invitation: Invitation): BoundMemberInvitation {
  return {
    code: invitation.code,
    formattedCode: formatInvitationCode(invitation.code),
    kind: invitation.kind,
    createdAt: invitation.createdAt,
    usedAt: invitation.usedAt,
  };
}

function adminInvitationDto(invitation: Invitation): InvitationListItem {
  return {
    id: invitation.id,
    code: invitation.code,
    formattedCode: formatInvitationCode(invitation.code),
    kind: invitation.kind,
    status: invitation.status,
    ownerMemberId: invitation.ownerMemberId,
    ownerEmail: null,
    boundMemberId: invitation.boundMemberId,
    boundEmail: null,
    createdAt: invitation.createdAt,
    usedAt: invitation.usedAt,
  };
}
