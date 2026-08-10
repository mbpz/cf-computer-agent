# Task 4 report: knowledge domain and Computer repository

## Files changed

- `src/knowledge/types.ts`: moves the note, document, and search-hit domain types out of the Worker entry point.
- `src/knowledge/search.ts`: provides deterministic Unicode keyword ranking and safe ID normalization.
- `src/knowledge/workspace-repository.ts`: encapsulates the Computer VFS index/content boundary, disposable workspace client, ENOENT handling, safe note paths, corruption handling, and directory creation.
- `src/knowledge/service.ts`: validates note inputs, preserves creation timestamps, persists updates, and builds search documents through a structural repository contract.
- `src/config.ts`: centralizes the Phase 0 workspace name, VFS paths, note-size limit, and model identifier for later route/AI slices.
- `src/search.ts`: temporary compatibility re-export for the still-unrewired `src/index.ts` entry point.
- `test/unit/search.test.ts` and `test/unit/service.test.ts`: exercise migrated search behavior and service validation, path safety, timestamp preservation, size limits, and deterministic search ordering.

## TDD evidence

- RED: `rtk npx vitest run test/unit/service.test.ts` failed because `../../src/knowledge/service` did not yet exist.
- GREEN: focused `service` and `search` tests passed 2 files and 9 tests after the initial implementation.
- Additional validation RED: the non-text ID case failed with the legacy `TypeError` from `toLocaleLowerCase`; GREEN now maps it to stable `NOTE_INVALID` and the focused service suite passes 6 tests.
- Review RED: `createNote(null)` failed with a raw property-access `TypeError`; GREEN now rejects both `null` and a numeric JSON-like container with `NOTE_INVALID`, status 400, before reading note properties.

## Verification

- `rtk npm run test:unit`: passed, 4 files and 17 tests.
- `rtk npm run typecheck`: passed after the review fixes.
- `rtk npm run check`: passed after the review fixes: generated binding types, TypeScript, 17 unit tests, Worker slice, and Wrangler dry deployment.
- `rtk git diff --check`: passed.

## Self-review

- The sole Computer type compatibility cast is private in `toWorkspaceHandle`, with the current upstream generated-stub mismatch documented beside it.
- Repository reads accept only records whose paths are exactly `/workspace/notes/<safe-id>.md`; invalid persisted paths and malformed JSON produce `INDEX_CORRUPT` rather than touching another VFS location.
- The service depends only on `KnowledgeRepository`, allowing deterministic structural fakes without Computer runtime setup.
- Search ties are sorted by score, then `updatedAt`, then ID, avoiding engine-dependent ordering.
- `APP_CONFIG` is the shared source for repository index/note paths and service size validation; the repository derives the index directory from the configured index path rather than duplicating it.

## Sequencing note and concerns

- Task 4’s plan originally says to remove `src/search.ts`, but Task 6 has not yet rewired `src/index.ts`. Per coordinator approval, it is retained as a three-line compatibility re-export so typecheck and the legacy public entry point continue to work. Task 6 should remove it after changing the import.
- `src/config.ts` was added in the review follow-up and is consumed by both the repository and service; the existing Worker entry point remains compatible through the approved search shim.
- Local test/build tooling emits its existing informational Workers AI binding warning. No remote deployment or production verification occurred.
