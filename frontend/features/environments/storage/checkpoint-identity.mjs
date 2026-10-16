// Frontend-facing binding for the checkpoint compatibility identity.
//
// The pins (`ALPINE_ISO_ARTIFACTS`) and the compatibility hash are owned by the
// browser-VM development profile. Duplicating them here would create a second
// source of truth for artifact digests, so this module re-exports the single
// derivation instead. It is only ever reached from a deferred chunk: the
// emitted-module-graph gate (`scripts/browser-vm-build-isolation.mjs`) forbids VM
// modules, including this module's transitive VM dependencies, in the eager graph,
// so `environment-vm-composition.ts` imports it dynamically.
export { alpineCheckpointIdentity } from '../../../../tools/browser-vm/alpine-iso.mjs';
