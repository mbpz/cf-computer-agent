export function createAsyncOwner() {
  let current = 0;
  return Object.freeze({
    claim() { return ++current; },
    isCurrent(token: number) { return token === current; },
    invalidate() { current += 1; },
  });
}
