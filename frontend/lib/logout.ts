import { apiFetch, type Fetcher } from "./api";

export async function postLogout(logoutUrl: string, requester: Fetcher = fetch): Promise<void> {
  if (!/^\/(?!\/)/u.test(logoutUrl)) throw new Error("LOGOUT_TARGET_INVALID");
  await apiFetch<void>(logoutUrl, {
    requester,
    method: "POST",
    credentials: "same-origin",
  });
}
