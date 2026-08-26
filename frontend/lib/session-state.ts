import { ApiRequestError } from "./api";

/** A missing session is an expected anonymous state, not an application error. */
export function isAnonymousSessionError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401 && error.code === "AUTH_REQUIRED";
}
