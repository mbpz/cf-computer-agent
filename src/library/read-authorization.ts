export function authorizedKnowledgeMemberCteSql(requireScopedRole: boolean): string {
  return `authorized_member AS (
    SELECT role FROM members WHERE id = ?${requireScopedRole ? " AND role = ?" : ""} AND status = 'active'
  )`;
}

export const ACTIVE_KNOWLEDGE_SPACE_JOIN_SQL =
  "JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'";

export const ACTIVE_KNOWLEDGE_ITEM_SQL = "k.status = 'active'";

export function readableKnowledgeRevisionSql(revisionAlias: "r" | "previous" = "r"): string {
  return `(${revisionAlias}.visibility = 'shared' OR am.role = 'admin')`;
}
