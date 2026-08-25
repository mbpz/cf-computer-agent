import { parseSessionPayload, type SessionSnapshot } from "../contracts/api";
import { apiFetch, type Fetcher } from "./api";

export async function sessionSnapshot(fetcher?: Fetcher): Promise<SessionSnapshot> {
  const payload = await apiFetch<unknown>("/api/session", fetcher ? { requester: fetcher } : undefined);
  return parseSessionPayload(payload);
}
