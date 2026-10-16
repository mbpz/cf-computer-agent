import { MENU_LABEL_KEYS, menuSnapshot, type MenuSnapshot } from "../../shared/admin-menu-fields";
import { AuditRepository } from "../audit/repository";
import { AppError } from "../http";
import { buildMenuTree, type MenuNode, type MenuRow } from "./menu-tree";
import { parsePermissionMask, serializePermissionMask } from "./permission-bitmap";

export interface MenuRecord extends MenuRow {
  status: "active" | "disabled";
  visible: boolean;
  isSystem: boolean;
}

type MenuDbRow = {
  id: string;
  parent_id: string | null;
  key: string;
  label_key: string;
  path: string | null;
  icon: string | null;
  group_name: string;
  position: number;
  required_bits: string;
  status: "active" | "disabled";
  visible: number;
  is_system: number;
};

export interface MenuUpdateInput {
  expected?: MenuSnapshot;
  parentId?: string | null;
  labelKey?: string;
  path?: string | null;
  position?: number;
  requiredBits?: string;
  status?: "active" | "disabled";
  visible?: boolean;
}
export interface MenuCreateInput { key: string; labelKey: string; path?: string | null; parentId?: string | null; icon?: string | null; groupName: "workspace" | "admin"; position: number; requiredBits: string; }
/** `created` distinguishes a fresh row from the replay of a recorded creation receipt. */
export interface MenuCreateResult { menu: MenuRecord; created: boolean }

type MenuReceiptRow = { kind: string; operation_id: string; request_hash: string; claim_id: string; response_json: string };

// Recorded operation identities. A creation is identified by its natural menu key
// (the stable key the admin editor already keeps across a refresh) and a deletion
// by the removed row's id, so the same intent replays its original receipt instead
// of failing as a duplicate or writing a second audit.
const CREATE_RECEIPT = "menu.create";
const DELETE_RECEIPT = "menu.delete";

const LABEL_KEYS = new Set<string>(MENU_LABEL_KEYS);

// Compare the entire validated, bounded configuration in the mutation statement.
// Per-row guards alone allow concurrent reparenting to create a cycle.
const snapshotSql = `SELECT json_group_array(json_object(
  'id',id,'parent_id',parent_id,'key',key,'label_key',label_key,'path',path,
  'icon',icon,'group_name',group_name,'position',position,'required_bits',required_bits,
  'status',status,'visible',visible,'is_system',is_system
)) AS token FROM (SELECT * FROM menus ORDER BY position ASC, key ASC LIMIT 201)`;
interface AdminMenuNode extends MenuRecord { children: AdminMenuNode[] }

export class MenusRepository {
  constructor(private readonly db: D1Database) {}

  async list(): Promise<{ items: MenuRecord[]; tree: AdminMenuNode[] }> {
    const items = await this.readItems();
    this.buildTree(items, (1n << 64n) - 1n);
    // Management must retain hidden/disabled nodes and all mutation metadata.
    // The member navigation tree is separately permission/visibility filtered.
    const children = (parentId: string | null): AdminMenuNode[] => items.filter(item => item.parentId === parentId).map(item => ({ ...item, children: children(item.id) }));
    return { items, tree: children(null) };
  }

  async navigation(permissionMask: bigint): Promise<{ tree: MenuNode[] }> {
    const items = await this.readItems();
    return { tree: this.buildTree(items, permissionMask) };
  }

  private async readSnapshot(): Promise<{ items: MenuRecord[]; token: string }> {
    const result = await this.db.prepare(snapshotSql).first<{ token: string }>();
    const token = result!.token;
    const rows = JSON.parse(token) as MenuDbRow[];
    if (rows.length > 200) throw new AppError("MENU_LIMIT_EXCEEDED", "Menu configuration exceeds its supported size", 409);
    return { items: rows.map(mapMenu), token };
  }

  private async readItems(): Promise<MenuRecord[]> { return (await this.readSnapshot()).items; }

  private buildTree(items: MenuRecord[], permissionMask: bigint): MenuNode[] {
    try {
      return buildMenuTree(items, permissionMask);
    } catch {
      throw new AppError("MENU_CONFIGURATION_INVALID", "Menu configuration is invalid", 500, true);
    }
  }

  async find(id: string): Promise<MenuRecord | null> {
    const row = await this.db.prepare(
      `SELECT id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system
       FROM menus WHERE id = ?`,
    ).bind(id).first<MenuDbRow>();
    return row ? mapMenu(row) : null;
  }

  async update(id: string, input: MenuUpdateInput, actorId: string): Promise<{ menu: MenuRecord; previous: MenuRecord }> {
    const { items, token } = await this.readSnapshot();
    const current = items.find(item => item.id === id);
    if (!current) throw new AppError("MENU_NOT_FOUND", "Menu not found", 404);
    if (current.isSystem) throw new AppError("MENU_SYSTEM_IMMUTABLE", "System menus cannot be changed", 409);
    if (input.expected && JSON.stringify(menuSnapshot(current)) !== JSON.stringify(menuSnapshot(input.expected))) throw new AppError("MENU_WRITE_CONFLICT", "Menu changed since the editor was opened", 409);
    const next: MenuRecord = {
      ...current,
      parentId: input.parentId === undefined ? current.parentId : input.parentId,
      labelKey: input.labelKey === undefined ? current.labelKey : input.labelKey,
      path: input.path === undefined ? current.path : input.path,
      position: input.position === undefined ? current.position : input.position,
      requiredBits: input.requiredBits === undefined ? current.requiredBits : serializePermissionMask(parsePermissionMask(input.requiredBits)),
      status: input.status === undefined ? current.status : input.status,
      visible: input.visible === undefined ? current.visible : input.visible,
    };
    validateMenu(next);
    const all = items.map((item) => item.id === id ? next : item);
    try { buildMenuTree(all, (1n << 64n) - 1n); } catch (error) {
      const message = error instanceof Error ? error.message : "MENU_TREE_INVALID";
      throw new AppError(message, "Menu tree is invalid", 400);
    }
    try {
      await this.writeWithAudit(this.db.prepare(
        `UPDATE menus SET parent_id = ?, label_key = ?, path = ?, position = ?, required_bits = ?, status = ?, visible = ?, updated_at = ? WHERE id = ? AND is_system = 0 AND (${snapshotSql}) = ?`,
      ).bind(next.parentId, next.labelKey, next.path, next.position, next.requiredBits, next.status, next.visible ? 1 : 0, new Date().toISOString(), id, token), actorId, current, next);
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed.*menus\.path/iu.test(error.message)) throw new AppError("MENU_PATH_DUPLICATE", "Menu path is already in use", 400);
      throw error;
    }
    return { menu: next, previous: current };
  }

  /**
   * Creation carries a recorded receipt. Its identity is the natural menu key, so
   * the same create request (a transport retry, a double submit, or the intent the
   * editor keeps across a refresh) replays the original row and writes neither a
   * second menu nor a second audit. The same key with a different payload stays a
   * duplicate conflict.
   */
  async create(input: MenuCreateInput, actorId: string): Promise<MenuCreateResult> {
    const key = boundedKey(input.key);
    const now = new Date().toISOString();
    const menu: MenuRecord = { id: `menu-${crypto.randomUUID()}`, parentId: input.parentId ?? null, key, labelKey: input.labelKey, path: input.path ?? null, icon: input.icon ?? null, groupName: input.groupName, position: input.position, requiredBits: serializePermissionMask(parsePermissionMask(input.requiredBits)), status: "active", visible: true, isSystem: false };
    validateMenu(menu);
    const requestHash = await writeIntentHash({ kind: CREATE_RECEIPT, key, parentId: menu.parentId, labelKey: menu.labelKey, path: menu.path, icon: menu.icon, groupName: menu.groupName, position: menu.position, requiredBits: menu.requiredBits });
    const recorded = await this.readReceipt(CREATE_RECEIPT, key);
    if (recorded) return { menu: replayRecord(recorded, requestHash, "MENU_DUPLICATE"), created: false };
    const { items: all, token } = await this.readSnapshot();
    if (all.length >= 200) throw new AppError("MENU_LIMIT_EXCEEDED", "Menu configuration exceeds its supported size", 409);
    if (menu.parentId !== null && !all.some((item) => item.id === menu.parentId)) throw new AppError("MENU_PARENT_NOT_FOUND", "Menu parent not found", 400);
    try {
      buildMenuTree([...all, menu], (1n << 64n) - 1n);
    } catch (error) {
      if (error instanceof Error && error.message === "MENU_PATH_DUPLICATE") throw new AppError("MENU_DUPLICATE", "Menu key or path is already in use", 409);
      throw new AppError("MENU_TREE_INVALID", "Menu hierarchy is invalid", 400);
    }
    const claimId = crypto.randomUUID();
    try {
      // One batch claims the operation, applies its effect only for the claim owner,
      // and reads the winning receipt. The claim carries the whole-tree compare-and-
      // set, so a lost race leaves no receipt behind and the retry replays the winner.
      const results = await this.db.batch([
        this.db.prepare(
          `INSERT OR IGNORE INTO menu_operation_receipts (kind, operation_id, request_hash, actor_id, claim_id, response_json, created_at)
           SELECT ?, ?, ?, ?, ?, ?, ? WHERE (${snapshotSql}) = ? AND NOT EXISTS (SELECT 1 FROM menus WHERE key = ?)`,
        ).bind(CREATE_RECEIPT, key, requestHash, actorId, claimId, JSON.stringify(menu), now, token, key),
        this.db.prepare(`INSERT INTO menus (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, 0, ?, ? WHERE EXISTS (SELECT 1 FROM menu_operation_receipts WHERE kind = ? AND operation_id = ? AND claim_id = ?)`)
          .bind(menu.id, menu.parentId, menu.key, menu.labelKey, menu.path, menu.icon, menu.groupName, menu.position, menu.requiredBits, now, now, CREATE_RECEIPT, key, claimId),
        this.prepareAudit(actorId, null, menu),
        this.db.prepare("SELECT kind, operation_id, request_hash, claim_id, response_json FROM menu_operation_receipts WHERE kind = ? AND operation_id = ?").bind(CREATE_RECEIPT, key),
      ]);
      const inserted = results[1]!;
      const receipt = results[3]?.results[0] as MenuReceiptRow | undefined;
      if (inserted.meta.changes === 1 && receipt?.claim_id === claimId) return { menu, created: true };
      if (receipt) return { menu: replayRecord(receipt, requestHash, "MENU_DUPLICATE"), created: false };
      // No receipt: the key is taken by an entry recorded before this operation
      // existed, by a competing intent, or the configuration moved meanwhile.
      const existing = await this.findByKey(key);
      if (existing && !existing.isSystem && sameCreationIntent(existing, menu)) return { menu: existing, created: false };
      if (existing) throw new AppError("MENU_DUPLICATE", "Menu key or path is already in use", 409);
      throw new AppError("MENU_WRITE_CONFLICT", "Menu configuration changed; read it before trying again", 409);
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed.*menus\.path/iu.test(error.message)) throw new AppError("MENU_PATH_DUPLICATE", "Menu path is already in use", 400);
      if (error instanceof Error && /UNIQUE constraint failed/iu.test(error.message)) throw new AppError("MENU_DUPLICATE", "Menu key or path is already in use", 409);
      throw error;
    }
  }

  /**
   * Deletion is a recorded operation identified by the removed row's id, which is
   * also the tombstone that keeps repeated deletes converging once the row is gone.
   * Removing a parent requires the caller to acknowledge the exact subtree impact it
   * displayed; that receipt is written in the same batch as the cascade and its
   * single audit, so a repeat replays the original result without new rows.
   */
  async remove(id: string, actorId: string, acknowledgedDescendantIds?: readonly string[]): Promise<MenuRecord> {
    const { items, token } = await this.readSnapshot();
    const current = items.find(item => item.id === id);
    const requestHash = await writeIntentHash({ kind: DELETE_RECEIPT, id });
    if (!current) {
      const recorded = await this.readReceipt(DELETE_RECEIPT, id);
      if (!recorded) throw new AppError("MENU_NOT_FOUND", "Menu not found", 404);
      return replayRecord(recorded, requestHash, "MENU_OPERATION_CONFLICT");
    }
    if (current.isSystem) throw new AppError("MENU_SYSTEM_IMMUTABLE", "System menus cannot be changed", 409);
    const subtree = collectSubtree(items, id);
    if (subtree.length > 0) {
      if (subtree.some(item => item.isSystem)) throw new AppError("MENU_SYSTEM_IMMUTABLE", "Menu subtree contains system entries", 409);
      if (acknowledgedDescendantIds === undefined) throw new AppError("MENU_HAS_CHILDREN", "Menu has child entries", 409);
      if (!sameSubtreeImpact(acknowledgedDescendantIds, subtree)) throw new AppError("MENU_IMPACT_CONFLICT", "Menu subtree changed since its impact was shown", 409);
    }
    const claimId = crypto.randomUUID();
    const descendantIds = subtree.map(item => item.id);
    const statements = [
      this.db.prepare(
        `INSERT OR IGNORE INTO menu_operation_receipts (kind, operation_id, request_hash, actor_id, claim_id, response_json, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE (${snapshotSql}) = ?`,
      ).bind(DELETE_RECEIPT, id, requestHash, actorId, claimId, JSON.stringify(current), new Date().toISOString(), token),
      ...(descendantIds.length === 0 ? [] : [this.db.prepare(`DELETE FROM menus WHERE id IN (${descendantIds.map(() => "?").join(", ")}) AND EXISTS (SELECT 1 FROM menu_operation_receipts WHERE kind = ? AND operation_id = ? AND claim_id = ?)`).bind(...descendantIds, DELETE_RECEIPT, id, claimId)]),
      this.db.prepare(`DELETE FROM menus WHERE id = ? AND is_system = 0 AND NOT EXISTS (SELECT 1 FROM menus child WHERE child.parent_id = menus.id) AND EXISTS (SELECT 1 FROM menu_operation_receipts WHERE kind = ? AND operation_id = ? AND claim_id = ?)`).bind(id, DELETE_RECEIPT, id, claimId),
      this.prepareAudit(actorId, current, null),
      // A deleted key becomes creatable again: its creation receipt must not replay
      // a row that no longer exists.
      this.db.prepare("DELETE FROM menu_operation_receipts WHERE kind = ? AND operation_id = ? AND EXISTS (SELECT 1 FROM menu_operation_receipts WHERE kind = ? AND operation_id = ? AND claim_id = ?)").bind(CREATE_RECEIPT, current.key, DELETE_RECEIPT, id, claimId),
      this.db.prepare("SELECT kind, operation_id, request_hash, claim_id, response_json FROM menu_operation_receipts WHERE kind = ? AND operation_id = ?").bind(DELETE_RECEIPT, id),
    ];
    const results = await this.db.batch(statements);
    const target = results[statements.length - 4]!;
    const receipt = results[statements.length - 1]?.results[0] as MenuReceiptRow | undefined;
    if (target.meta.changes === 1 && receipt?.claim_id === claimId) return current;
    if (receipt) return replayRecord(receipt, requestHash, "MENU_OPERATION_CONFLICT");
    throw new AppError("MENU_WRITE_CONFLICT", "Menu configuration changed; read it before trying again", 409);
  }

  private async readReceipt(kind: string, operationId: string): Promise<MenuReceiptRow | null> {
    return await this.db.prepare("SELECT kind, operation_id, request_hash, claim_id, response_json FROM menu_operation_receipts WHERE kind = ? AND operation_id = ?").bind(kind, operationId).first<MenuReceiptRow>() ?? null;
  }

  private async findByKey(key: string): Promise<MenuRecord | null> {
    const row = await this.db.prepare(
      `SELECT id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system
       FROM menus WHERE key = ?`,
    ).bind(key).first<MenuDbRow>();
    return row ? mapMenu(row) : null;
  }

  private prepareAudit(actorId: string, previous: MenuRecord | null, next: MenuRecord | null): D1PreparedStatement {
    return new AuditRepository(this.db).prepareChangedRowAudit({
      id: crypto.randomUUID(), actorKind: "member", actorId, action: "menu.updated", resourceType: "menu", resourceId: (next ?? previous)!.id,
      metadata: { previousPath: previous?.path ?? null, path: next?.path ?? null, previousStatus: previous?.status ?? "disabled", status: next?.status ?? "disabled", previousVisible: previous?.visible ?? false, visible: next?.visible ?? false },
      createdAt: new Date().toISOString(),
    });
  }

  private async writeWithAudit(statement: D1PreparedStatement, actorId: string, previous: MenuRecord | null, next: MenuRecord | null): Promise<void> {
    const [result] = await this.db.batch([statement, this.prepareAudit(actorId, previous, next)]);
    if (result!.meta.changes !== 1) throw new AppError("MENU_WRITE_CONFLICT", "Menu configuration changed; read it before trying again", 409);
  }

}

function mapMenu(row: MenuDbRow): MenuRecord {
  return {
    id: row.id, parentId: row.parent_id, key: row.key, labelKey: row.label_key, path: row.path,
    icon: row.icon, groupName: row.group_name, position: Number(row.position), requiredBits: serializePermissionMask(parsePermissionMask(row.required_bits)),
    status: row.status, visible: row.visible === 1, isSystem: row.is_system === 1,
  };
}

function validateMenu(menu: MenuRecord): void {
  if (menu.parentId !== null && (!menu.parentId || menu.parentId === menu.id)) throw new AppError("MENU_PARENT_INVALID", "Menu parent is invalid", 400);
  if (!LABEL_KEYS.has(menu.labelKey)) throw new AppError("MENU_LABEL_KEY_INVALID", "Menu label key is invalid", 400);
  if (menu.path !== null && (!/^\/[A-Za-z0-9_\-/:.]*$/u.test(menu.path) || menu.path.length > 200)) throw new AppError("MENU_PATH_INVALID", "Menu path is invalid", 400);
  if (!Number.isSafeInteger(menu.position) || menu.position < 0 || menu.position > 10000) throw new AppError("MENU_POSITION_INVALID", "Menu position is invalid", 400);
  if (menu.status !== "active" && menu.status !== "disabled") throw new AppError("MENU_STATUS_INVALID", "Menu status is invalid", 400);
  if (typeof menu.visible !== "boolean") throw new AppError("MENU_VISIBLE_INVALID", "Menu visibility is invalid", 400);
  if (menu.groupName !== "workspace" && menu.groupName !== "admin") throw new AppError("MENU_GROUP_INVALID", "Menu group is invalid", 400);
}

function boundedKey(value: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{1,63}$/u.test(value)) throw new AppError("MENU_KEY_INVALID", "Menu key is invalid", 400);
  return value;
}

/** Every descendant of `id`, breadth-first with a cycle guard: a malformed tree must
 * never turn a delete into an unbounded walk. */
function collectSubtree(items: readonly MenuRecord[], id: string): MenuRecord[] {
  const found: MenuRecord[] = [];
  const seen = new Set<string>([id]);
  const pending = [id];
  while (pending.length > 0 && found.length < 200) {
    const parentId = pending.pop()!;
    for (const item of items) {
      if (item.parentId !== parentId || seen.has(item.id)) continue;
      seen.add(item.id);
      found.push(item);
      pending.push(item.id);
    }
  }
  return found;
}

/** The acknowledged impact must describe exactly the current subtree, so a stale
 * confirmation cannot remove entries the operator never saw. */
function sameSubtreeImpact(acknowledged: readonly string[], subtree: readonly MenuRecord[]): boolean {
  if (acknowledged.length !== subtree.length) return false;
  for (const item of subtree) if (!acknowledged.includes(item.id)) return false;
  return true;
}

/** An entry recorded before receipts existed still answers an identical creation
 * intent instead of reporting a duplicate of itself. */
function sameCreationIntent(record: MenuRecord, requested: MenuRecord): boolean {
  return record.parentId === requested.parentId && record.labelKey === requested.labelKey
    && record.path === requested.path && record.icon === requested.icon
    && record.groupName === requested.groupName && record.position === requested.position
    && record.requiredBits === requested.requiredBits;
}

/**
 * Reads a recorded operation. A reused identity with a different intent is refused
 * instead of silently changing meaning; the caller chooses the conflict code.
 */
function replayRecord(receipt: MenuReceiptRow, requestHash: string, conflictCode: string): MenuRecord {
  if (receipt.request_hash !== requestHash) throw new AppError(conflictCode, "Menu write intent does not match the recorded operation", 409);
  return JSON.parse(receipt.response_json) as MenuRecord;
}

async function writeIntentHash(intent: Record<string, unknown>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(intent))));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}
