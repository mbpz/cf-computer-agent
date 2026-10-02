import type { createWorkspaceNavigationGate, WorkspaceNavigationPermit } from "./workspace-navigation-gate";

export interface WorkspaceHistoryEntry { key: string; id: string; url: string }
export type WorkspaceHistoryFault = "unknown-entry" | "restore-failed" | "replay-failed";
export interface WorkspaceHistoryPort {
  read(): WorkspaceHistoryEntry | null;
  // Implementations must verify the exact entry identity before initiating a move.
  traverse(entry: WorkspaceHistoryEntry): Promise<void>;
  publish(entry: WorkspaceHistoryEntry): void;
  fault(reason: WorkspaceHistoryFault): void;
}
const sameEntry = (a: WorkspaceHistoryEntry | null, b: WorkspaceHistoryEntry | null) =>
  !!a && !!b && a.key === b.key && a.id === b.id && a.url === b.url;

type Intent = {
  target: WorkspaceHistoryEntry | null;
  phase: "restore" | "prompt" | "replay" | "cancel";
  command: number;
  permit?: WorkspaceNavigationPermit;
  replayPending?: boolean;
  cancelRestoreStarted?: boolean;
};

/** Keeps routing on the accepted entry until an actual, freshly admitted arrival.
 * Promise completion is not an arrival: native finished may precede popstate.
 */
export function createWorkspaceHistoryTraversal(gate: ReturnType<typeof createWorkspaceNavigationGate>, port: WorkspaceHistoryPort) {
  const initial = port.read();
  if (!initial) throw new Error("History requires a known initial entry");
  let accepted = { ...initial };
  let intent: Intent | null = null;
  let disposed = false;
  let faulted = false;
  const active = (attempt: Intent) => !disposed && !faulted && intent === attempt;

  function cancel(attempt: Intent) {
    if (!active(attempt)) return;
    attempt.command++;
    attempt.phase = "cancel";
    if (sameEntry(port.read(), accepted)) {
      if (!attempt.replayPending) intent = null;
    } else {
      attempt.cancelRestoreStarted = true;
      move(attempt, accepted);
    }
  }

  function abandon(attempt: Intent) {
    // Invalidate the consent while the old identity still owns its cancellation.
    if (attempt.phase === "prompt" || attempt.phase === "replay") gate.invalidate();
    if (active(attempt) && attempt.phase !== "cancel") cancel(attempt);
  }

  function move(attempt: Intent, entry: WorkspaceHistoryEntry) {
    const command = ++attempt.command;
    const replay = attempt.phase === "replay";
    if (replay) attempt.replayPending = true;
    const settled = () => {
      if (!replay || !active(attempt)) return;
      attempt.replayPending = false;
      if (attempt.phase === "cancel") {
        if (sameEntry(port.read(), accepted)) intent = null;
        else if (!attempt.cancelRestoreStarted) {
          attempt.cancelRestoreStarted = true;
          move(attempt, accepted);
        }
      }
    };
    const failed = () => {
      if (!active(attempt) || attempt.command !== command) return;
      if (attempt.phase === "replay") {
        abandon(attempt);
        port.fault("replay-failed");
      } else {
        faulted = true;
        // Lock before cleanup so a stale prompt cannot start another restoration.
        gate.invalidate();
        port.fault("restore-failed");
      }
    };
    try {
      void port.traverse({ ...entry }).then(settled, () => { settled(); failed(); });
    } catch { settled(); failed(); }
  }

  function restored(attempt: Intent) {
    attempt.command++; // Late rejection of the completed restore cannot kill replay.
    if (attempt.phase === "cancel") { if (!attempt.replayPending) intent = null; return; }
    if (!attempt.target) { intent = null; port.fault("unknown-entry"); return; }
    attempt.phase = "prompt";
    gate.prepare(permit => {
      if (!active(attempt)) { permit.cancel(); return; }
      attempt.permit = permit;
      attempt.phase = "replay";
      move(attempt, attempt.target!);
    }, () => cancel(attempt));
  }

  return {
    accepted: () => ({ ...accepted }),
    busy: () => disposed || faulted || intent !== null,
    observe() {
      if (disposed || faulted) return;
      const current = port.read();
      const attempt = intent;
      if (!attempt) {
        if (sameEntry(current, accepted)) return;
        intent = { target: current && { ...current }, phase: "restore", command: 0 };
        move(intent, accepted);
        return;
      }
      if (attempt.phase === "restore" || attempt.phase === "cancel") {
        if (sameEntry(current, accepted)) restored(attempt);
        else if (attempt.phase === "cancel" && !attempt.cancelRestoreStarted) {
          attempt.cancelRestoreStarted = true;
          move(attempt, accepted);
        }
        return;
      }
      if (attempt.phase === "prompt") {
        if (!sameEntry(current, accepted)) abandon(attempt);
        return;
      }
      if (sameEntry(current, attempt.target)) {
        attempt.replayPending = false; // The requested arrival is now observed.
        attempt.command++;
        attempt.permit!.commit(() => {
          accepted = { ...attempt.target! };
          intent = null;
          port.publish({ ...accepted });
        });
      } else if (!sameEntry(current, accepted)) abandon(attempt);
    },
    recordCommit() {
      if (disposed || faulted || intent) throw new Error("Cannot rebase busy history");
      const current = port.read();
      if (!current) throw new Error("Cannot record an unknown history entry");
      accepted = { ...current };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const old = intent;
      intent = null;
      if (old?.phase === "prompt" || old?.phase === "replay") gate.invalidate();
    },
  };
}
