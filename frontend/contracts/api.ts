export interface SessionMember {
  id: string;
  email: string;
  role: "admin" | "contributor";
}

export interface SessionSnapshot {
  member: SessionMember;
  capabilities: string[];
  logoutUrl: string;
}

export function parseSessionPayload(value: unknown): SessionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SESSION_INVALID");
  const record = value as Record<string, unknown>;
  const member = record.member;
  if (!member || typeof member !== "object" || Array.isArray(member)) throw new Error("SESSION_INVALID");
  const memberRecord = member as Record<string, unknown>;
  if (typeof memberRecord.id !== "string" || !memberRecord.id
    || typeof memberRecord.email !== "string" || !memberRecord.email
    || (memberRecord.role !== "admin" && memberRecord.role !== "contributor")
    || !Array.isArray(record.capabilities) || record.capabilities.some((capability) => typeof capability !== "string")
    || typeof record.logoutUrl !== "string" || !record.logoutUrl.startsWith("/")) {
    throw new Error("SESSION_INVALID");
  }
  return {
    member: {
      id: memberRecord.id,
      email: memberRecord.email,
      role: memberRecord.role,
    },
    capabilities: [...new Set(record.capabilities as string[])],
    logoutUrl: record.logoutUrl,
  };
}
