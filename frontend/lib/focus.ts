interface FocusOwner { focus?: () => void; }

export function createFocusRestorer() {
  let owner: FocusOwner | null = null;
  return Object.freeze({
    capture(next: FocusOwner) { owner = next; },
    release() {
      if (!owner) return false;
      const current = owner;
      owner = null;
      current.focus?.();
      return true;
    },
  });
}
