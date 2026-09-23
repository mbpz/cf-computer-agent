/** Public synthetic credentials for local tests only. NEVER use in production. */
export const CONTROL_TOKEN = 'A'.repeat(43);
export const OTHER_CONTROL_TOKEN = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function controlRequest(
  action: 'status' | 'begin-drain' | 'resume',
  payload?: { window: string; epoch: number },
  token = CONTROL_TOKEN,
): Request {
  return new Request(`https://local.test/__ops/maintenance/${action}`, {
    method: action === 'status' ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(action === 'status' ? {} : { 'Content-Type': 'application/json' }) },
    ...(action === 'status' ? {} : { body: JSON.stringify(payload) }),
  });
}
