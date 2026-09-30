import type { Fetcher } from "./api";
import { postLogout } from "./logout";
import { sessionSnapshot } from "./session";
import { isAnonymousSessionError } from "./session-state";

/** Local network authority is revoked before contacting the server. A failed
 * logout never reactivates old resources, even while the shell remains signed in.
 */
export async function logoutAccount(owner: { dispose(): void }, logoutUrl: string, requester?: Fetcher): Promise<void> {
  owner.dispose();
  await postLogout(logoutUrl, requester);
  try {
    await sessionSnapshot(requester);
    throw new Error("LOGOUT_NOT_CONFIRMED");
  } catch (error: unknown) {
    if (!isAnonymousSessionError(error)) throw error;
  }
}
