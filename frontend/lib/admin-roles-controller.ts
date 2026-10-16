import { useEffect, useRef, useState } from "react";
import { ApiRequestError } from "./api";
import { assignAdminRoleMember, createAdminRole, loadAdminRoles, unassignAdminRoleMember, updateAdminRole, type AdminRole } from "./admin-roles-data";
import { clearAdminRoleWrite, discardBlockedAdminRoleWrite, loadAdminRoleWrite, saveAdminRoleWrite, type AdminRoleWriteIntent } from "./admin-role-write-intent";
import { persistAdminRoleDraft } from "./admin-role-draft";
import { registerWorkspaceLeaveGuard } from "./workspace-location";
import { frontendText, type LocaleRuntime } from "./i18n";

export type AdminRolesState =
  | { kind: "loading" }
  | { kind: "error" | "forbidden"; message?: string }
  | { kind: "ready"; roles: AdminRole[] };

export interface AdminRolesController {
  state: AdminRolesState;
  saving: boolean;
  writeBlocked: boolean;
  readPending: boolean;
  readRequired: boolean;
  saveError: string | null;
  recordBlocked: boolean;
  discardRecord: () => void;
  retryRead: () => void;
  /** Re-sends the recorded intent with its original client key so the server replays one result. */
  retryWrite: () => Promise<boolean>;
  /** Records the intent before sending it, keeps the write lock until an authoritative read lands. */
  mutate: (intent: AdminRoleWriteIntent, operation: () => Promise<unknown>, errorKey: string) => Promise<boolean>;
  /** Convenience wrappers so the routes never re-implement an intent or an endpoint call. */
  saveRole: (roleId: string, allowBits: string, expectedAllowBits: string) => Promise<boolean>;
  createRole: (input: { key: string; name: string; description?: string; allowBits: string }) => Promise<boolean>;
  assignMember: (roleId: string, targetId: string) => Promise<boolean>;
  unassignMember: (roleId: string, targetId: string) => Promise<boolean>;
}

const writeErrorKeys: Record<AdminRoleWriteIntent["op"], string> = {
  update: "ADMIN_ROLES_SAVE_ERROR",
  create: "ADMIN_ROLES_CREATE_ERROR",
  assign: "ADMIN_ROLES_MEMBER_ASSIGN_ERROR",
  unassign: "ADMIN_ROLES_MEMBER_ASSIGN_ERROR",
};

/** The single intent-to-endpoint mapping, reused by the first attempt and by a keyed retry. */
function requestFor(intent: AdminRoleWriteIntent): Promise<unknown> {
  if (intent.op === "update") return updateAdminRole(intent.roleId, { allowBits: intent.allowBits, expectedAllowBits: intent.expectedAllowBits });
  if (intent.op === "create") {
    return createAdminRole({ operationId: intent.operationId, key: intent.key, name: intent.name, allowBits: intent.allowBits, ...(intent.description.length === 0 ? {} : { description: intent.description }) });
  }
  if (intent.op === "assign") return assignAdminRoleMember(intent.roleId, intent.memberId);
  return unassignAdminRoleMember(intent.roleId, intent.memberId);
}

/**
 * The one place a role read or write lives, shared by the list, create and detail routes so
 * the write-intent record, recovery lock and read-back reconciliation are never duplicated.
 */
export function useAdminRolesController({ locale, memberId }: { locale: LocaleRuntime; memberId?: string }): AdminRolesController {
  const [writeStored] = useState(() => memberId ? loadAdminRoleWrite(memberId) : { kind: "empty" as const });
  const recordBlockedRef = useRef(writeStored.kind === "blocked");
  const [recordBlocked, setRecordBlocked] = useState(recordBlockedRef.current);
  const [recordNotice, setRecordNotice] = useState<string>();
  const [state, setState] = useState<AdminRolesState>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [needsRead, setNeedsRead] = useState(writeStored.kind === "ready");
  const [saveError, setSaveError] = useState<string | null>(null);
  const epoch = useRef<object | null>(null);
  const readRef = useRef<AbortController | null>(null);
  const writeRef = useRef<object | null>(null);
  const blockedRef = useRef(writeStored.kind === "ready");
  const intentRef = useRef<AdminRoleWriteIntent | null>(writeStored.kind === "ready" ? writeStored.intent : null);
  useEffect(() => {
    // This guard outlives the editor: denied/failed reads can replace its UI
    // without resolving a write. Never offer "discard" for an unknown outcome.
    const owner = window;
    const locked = () => writeRef.current !== null || blockedRef.current;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: locked() ? "block" : "allow" }));
    const warn = (event: BeforeUnloadEvent) => {
      if (locked()) { event.preventDefault(); event.returnValue = ""; }
    };
    owner.addEventListener("beforeunload", warn);
    return () => { unregister(); owner.removeEventListener("beforeunload", warn); };
  }, []);
  const deny = (error: unknown) => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_ROLES_UNAVAILABLE") });
    setSaveError(null);
    return true;
  };
  const read = async () => {
    if (!epoch.current || readRef.current) return false;
    const scope = epoch.current;
    const controller = new AbortController();
    const activeWrite = writeRef.current;
    readRef.current = controller;
    setReading(true);
    try {
      const roles = await loadAdminRoles(fetch, controller.signal);
      if (epoch.current !== scope || readRef.current !== controller) return false;
      setState({ kind: "ready", roles });
      if (!activeWrite && !writeRef.current) {
        const intent = intentRef.current;
        if (memberId && intent && !clearAdminRoleWrite(memberId, intent)) {
          blockedRef.current = true; setNeedsRead(true);
          setRecordNotice(frontendText(locale, "ADMIN_ROLES_RECORD_STUCK"));
        } else {
          intentRef.current = null;
          if (intent) setRecordNotice(undefined);
          blockedRef.current = false; setNeedsRead(false); setSaveError(null);
        }
      }
      return true;
    } catch (error) {
      if (epoch.current !== scope || readRef.current !== controller) return false;
      if (!deny(error)) {
        const message = frontendText(locale, "ADMIN_ROLES_UNAVAILABLE");
        setState((previous) => previous.kind === "ready" ? previous : { kind: "error", message });
        setSaveError(message);
      }
      return false;
    } finally {
      if (readRef.current === controller) { readRef.current = null; setReading(false); }
    }
  };
  useEffect(() => {
    epoch.current = {};
    setState({ kind: "loading" });
    void read();
    return () => { epoch.current = null; readRef.current?.abort(); readRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  const retryRead = () => {
    if (readRef.current || writeRef.current) return;
    if (state.kind !== "ready") setState({ kind: "loading" });
    void read();
  };
  const send = async (intent: AdminRoleWriteIntent, operation: () => Promise<unknown>, errorKey: string) => {
    if (memberId && !saveAdminRoleWrite(memberId, intent)) {
      setRecordNotice(frontendText(locale, "ADMIN_ROLES_NOT_RECORDED"));
      return false;
    }
    if (memberId) { intentRef.current = intent; persistAdminRoleDraft(memberId, null); }
    const scope = epoch.current;
    const token = {};
    writeRef.current = token;
    blockedRef.current = true;
    setSaving(true);
    setNeedsRead(true);
    setSaveError(null);
    setRecordNotice(undefined);
    try {
      await operation();
      if (epoch.current !== scope) return false;
      // A receipt acknowledges the request, not the current member set. Always read it.
      writeRef.current = null;
      setSaving(false);
      return await read();
    } catch (error) {
      if (epoch.current === scope && !deny(error)) setSaveError(frontendText(locale, errorKey));
      return false;
    } finally {
      if (writeRef.current === token) {
        writeRef.current = null;
        if (epoch.current) setSaving(false);
      }
    }
  };
  const mutate = async (intent: AdminRoleWriteIntent, operation: () => Promise<unknown>, errorKey: string) => {
    if (recordBlockedRef.current || !epoch.current || state.kind !== "ready" || writeRef.current || readRef.current || blockedRef.current) return false;
    return send(intent, operation, errorKey);
  };
  // A keyed retry is not a new write: the recorded intent keeps its client key,
  // so the server returns the recorded result instead of a duplicate conflict.
  const retryWrite = async () => {
    const intent = intentRef.current;
    if (!intent || recordBlockedRef.current || !epoch.current || state.kind !== "ready" || writeRef.current || readRef.current) return false;
    return send(intent, () => requestFor(intent), writeErrorKeys[intent.op]);
  };
  function discardRecord() {
    if (!memberId || !recordBlockedRef.current || !discardBlockedAdminRoleWrite(memberId)) return;
    recordBlockedRef.current = false; setRecordBlocked(false); setRecordNotice(undefined);
  }
  const guarded = <A extends unknown[]>(operation: (...args: A) => Promise<boolean>) => (...args: A) => recordBlocked ? Promise.resolve(false) : operation(...args);
  const saveRole = guarded((roleId: string, allowBits: string, expectedAllowBits: string) => {
    const intent: AdminRoleWriteIntent = { op: "update", roleId, allowBits: allowBits.toLowerCase(), expectedAllowBits: expectedAllowBits.toLowerCase() };
    return mutate(intent, () => requestFor(intent), writeErrorKeys.update);
  });
  const createRole = guarded((input: { key: string; name: string; description?: string; allowBits: string }) => {
    const key = input.key.trim(); const name = input.name.trim(); const description = input.description ?? ""; const allowBits = input.allowBits.toLowerCase();
    // A retry of the same creation must carry the same operation number.
    const stored = memberId ? loadAdminRoleWrite(memberId) : { kind: "empty" as const };
    const operationId = stored.kind === "ready" && stored.intent.op === "create" && stored.intent.key === key
      && stored.intent.name === name && stored.intent.description === description && stored.intent.allowBits === allowBits
      ? stored.intent.operationId : crypto.randomUUID();
    const intent: AdminRoleWriteIntent = { op: "create", operationId, key, name, description, allowBits };
    return mutate(intent, () => requestFor(intent), writeErrorKeys.create);
  });
  const assignMember = guarded((roleId: string, targetId: string) => {
    const intent: AdminRoleWriteIntent = { op: "assign", roleId, memberId: targetId };
    return mutate(intent, () => requestFor(intent), writeErrorKeys.assign);
  });
  const unassignMember = guarded((roleId: string, targetId: string) => {
    const intent: AdminRoleWriteIntent = { op: "unassign", roleId, memberId: targetId };
    return mutate(intent, () => requestFor(intent), writeErrorKeys.unassign);
  });
  return {
    state, saving, recordBlocked, discardRecord, retryRead, retryWrite, mutate, saveRole, createRole, assignMember, unassignMember,
    writeBlocked: reading || needsRead,
    readPending: reading || saving,
    readRequired: needsRead,
    saveError: recordNotice ?? saveError,
  };
}
