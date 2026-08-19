import { AppError } from "./http";

const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export function fixedLengthBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  return fixedLengthBytesEqual(a, b);
}

export interface AuthEnvironment {
  APP_TOKEN?: string;
}

export async function verifyAutomationToken(
  request: Request,
  env: AuthEnvironment,
): Promise<void> {
  if (!env.APP_TOKEN) {
    throw new AppError("AUTH_MISCONFIGURED", "Authentication is not configured", 503);
  }
  const header = request.headers.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!(await constantTimeEqual(supplied, env.APP_TOKEN))) {
    throw new AppError("AUTH_REQUIRED", "Authentication required", 401);
  }
}
