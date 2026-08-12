export type MemberRole = "admin" | "contributor";
export type MemberStatus = "active" | "disabled";

export interface Member {
  id: string;
  accessSub: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
}

export interface CreateMember {
  id: string;
  accessSub: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MemberPage {
  items: Member[];
  nextCursor?: string;
}
