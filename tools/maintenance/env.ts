import { env as runtimeEnv } from 'cloudflare:workers';
import type { LocalResources } from './resources';

// Only the independent local harness has these bindings; do not augment app Env.
export const env = runtimeEnv as unknown as LocalResources;
