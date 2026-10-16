import type { CheckpointIdentity } from './checkpoints.mjs';

/** Compatibility identity for the pinned RAM-root/in-memory-9p/read-only-ISO profile. */
export function alpineCheckpointIdentity(): Promise<CheckpointIdentity>;
