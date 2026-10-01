/** A decision belongs to exactly one navigation attempt, not just one draft. */
export interface WorkspaceLeaveDecision { accept(): void; cancel(): void }
export type WorkspaceLeaveState =
  | { kind: "allow" }
  | { kind: "block" }
  | { kind: "confirm"; version: string; prompt(decision: WorkspaceLeaveDecision): void; dismiss(): void };
export type WorkspaceLeaveGuard = () => WorkspaceLeaveState;
export type WorkspaceNavigationResult = "committed" | "deferred" | "blocked";

type Registration = { read: WorkspaceLeaveGuard };
type Confirmation = Extract<WorkspaceLeaveState, { kind: "confirm" }>;
type Prompt = { registration: Registration; state: Confirmation };
type Attempt = {
  registrations: Registration[];
  approved: Map<Registration, string>;
  commit: () => void;
  result: WorkspaceNavigationResult;
  prompt?: Prompt;
};

/** No browser or React dependency. Instantiate once per navigation/session boundary. */
export function createWorkspaceNavigationGate() {
  const registrations = new Set<Registration>();
  let pending: Attempt | null = null;
  let callbackDepth = 0;

  function dismiss(attempt: Attempt) {
    const prompt = attempt.prompt;
    attempt.prompt = undefined;
    if (!prompt) return;
    callbackDepth++;
    try { prompt.state.dismiss(); } finally { callbackDepth--; }
  }

  function invalidate() {
    const attempt = pending;
    if (!attempt) return;
    // Invalidate identity before invoking user cleanup; even captured callbacks are dead.
    pending = null;
    attempt.result = "blocked";
    dismiss(attempt);
  }

  function advance(attempt: Attempt): void {
    if (pending !== attempt) return;
    try {
      const states = attempt.registrations.map(registration => ({ registration, state: registration.read() }));
      // A guard read may synchronously trigger scope cleanup or replacement.
      if (pending !== attempt) return;
      if (states.some(({ state }) => state.kind === "block")) { invalidate(); return; }
      for (const { registration, state } of states) {
        if (state.kind === "confirm" && attempt.approved.has(registration)
          && attempt.approved.get(registration) !== state.version) { invalidate(); return; }
      }
      const next = states.find(({ registration, state }) => state.kind === "confirm" && !attempt.approved.has(registration));
      if (next && next.state.kind === "confirm") {
        const prompt: Prompt = { registration: next.registration, state: next.state };
        attempt.prompt = prompt;
        const decision: WorkspaceLeaveDecision = {
          accept() {
            if (pending !== attempt || attempt.prompt !== prompt) return;
            attempt.approved.set(prompt.registration, prompt.state.version);
            try { dismiss(attempt); advance(attempt); }
            catch (cause) { if (pending === attempt) invalidate(); throw cause; }
          },
          cancel() { if (pending === attempt && attempt.prompt === prompt) invalidate(); },
        };
        prompt.state.prompt(decision);
        return;
      }
      // Keep the synchronous reservation through commit: a route callback cannot
      // recursively navigate, even if it unmounts its guard during the commit.
      callbackDepth++;
      try { attempt.commit(); attempt.result = "committed"; }
      finally { callbackDepth--; if (pending === attempt) pending = null; }
    } catch (cause) {
      if (pending === attempt) invalidate();
      throw cause;
    }
  }

  return {
    register(read: WorkspaceLeaveGuard): () => void {
      invalidate();
      const registration = { read };
      registrations.add(registration);
      return () => { if (registrations.delete(registration)) invalidate(); };
    },
    request(commit: () => void): WorkspaceNavigationResult {
      if (pending || callbackDepth) return "blocked";
      const attempt: Attempt = { registrations: [...registrations], approved: new Map(), commit, result: "deferred" };
      pending = attempt;
      advance(attempt);
      return attempt.result;
    },
    invalidate,
  };
}
