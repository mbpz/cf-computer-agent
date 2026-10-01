// Invalidation only: never publish a member ID, count or notification payload.
// Observers re-read the authenticated endpoint, never infer a decrement.
const listeners = new Set<() => void>();
export function invalidateNotificationSummary(): void {
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* An observer cannot change a mutation result. */ }
  }
}
export function subscribeNotificationSummary(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
