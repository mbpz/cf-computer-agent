import { parseSessionPayload, type SessionSnapshot } from "../contracts/api";
import { apiFetch, type Fetcher } from "./api";

export async function sessionSnapshot(fetcher?: Fetcher): Promise<SessionSnapshot> {
  const payload = await apiFetch<unknown>("/api/session", {
    ...(fetcher ? { requester: fetcher } : {}),
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  return parseSessionPayload(payload);
}

export interface AuthProviderCapabilities {
  github: boolean;
  wechat: boolean;
}

export async function authProviderCapabilities(): Promise<AuthProviderCapabilities> {
  const response = await fetch("/api/auth/providers", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("AUTH_PROVIDERS_UNAVAILABLE");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("AUTH_PROVIDERS_INVALID");
  const value = payload as Record<string, unknown>;
  if (typeof value.github !== "boolean" || typeof value.wechat !== "boolean") throw new Error("AUTH_PROVIDERS_INVALID");
  return { github: value.github, wechat: value.wechat };
}
