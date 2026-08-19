export type MemberRole = "admin" | "contributor";
export type MemberStatus = "active" | "disabled";

export interface MemberIdentity {
  identitySubject: string;
  email: string;
}

export interface Member {
  id: string;
  identitySubject: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
}

export interface CreateMember {
  id: string;
  identitySubject: string;
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
