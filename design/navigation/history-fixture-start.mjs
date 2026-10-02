/** Only seed the reserved fixture landing page, never a restored route.
 * @param {{location: {pathname: string, search: string}, history: {replaceState(data: unknown, unused: string, url: string): void}}} owner
 * @param {(mode: "push", url: string) => unknown} write
 * @param {string} arrivalType
 */
export function seedHistoryFixture(owner, write, arrivalType = "navigate") {
  if (arrivalType !== "navigate" || owner.location.pathname !== "/" || owner.location.search) return;
  owner.history.replaceState({}, "", "/inbox");
  write("push", "/tasks");
}
