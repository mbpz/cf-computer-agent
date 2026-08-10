# Task 4 report: knowledge domain and Computer repository

## Files changed

- `src/knowledge/types.ts`: moves the note, document, and search-hit domain types out of the Worker entry point.
- `src/knowledge/search.ts`: provides deterministic Unicode keyword ranking and safe ID normalization.
- `src/knowledge/workspace-repository.ts`: encapsulates the Computer VFS index/content boundary, disposable workspace client, ENOENT handling, safe note paths, corruption handling, and directory creation.
- `src/knowledge/service.ts`: validates note inputs, preserves creation timestamps, persists updates, and builds search documents through a structural repository contract.
- `src/search.ts`: temporary compatibility re-export for the still-unrewired `src/index.ts` entry point.
- `test/unit/search.test.ts` and `test/unit/service.test.ts`: exercise migrated search behavior and service validation, path safety, timestamp preservation, size limits, and deterministic search ordering.

## TDD evidence

- RED: `rtk npx vitest run test/unit/service.test.ts` failed because `../../src/knowledge/service` did not yet exist.
- GREEN: focused `service` and `search` tests passed 2 files and 9 tests after the initial implementation.
- Additional validation RED: the non-text ID case failed with the legacy `TypeError` from `toLocaleLowerCase`; GREEN now maps it to stable `NOTE_INVALID` and the focused service suite passes 6 tests.

## Verification

- `rtk npm run test:unit`: passed, 4 files and 15 tests.
- `rtk npm run check`: passed: generated binding types, TypeScript, 15 unit tests, Worker slice, and Wrangler dry deployment.
- `rtk git diff --check`: passed.

## Self-review

- The sole Computer type compatibility cast is private in `toWorkspaceHandle`, with the current upstream generated-stub mismatch documented beside it.
- Repository reads accept only records whose paths are exactly `/workspace/notes/<safe-id>.md`; invalid persisted paths and malformed JSON produce `INDEX_CORRUPT` rather than touching another VFS location.
- The service depends only on `KnowledgeRepository`, allowing deterministic structural fakes without Computer runtime setup.
- Search ties are sorted by score, then `updatedAt`, then ID, avoiding engine-dependent ordering.

## Sequencing note and concerns

- Task 4’s plan originally says to remove `src/search.ts`, but Task 6 has not yet rewired `src/index.ts`. Per coordinator approval, it is retained as a three-line compatibility re-export so typecheck and the legacy public entry point continue to work. Task 6 should remove it after changing the import.
- `src/config.ts` is intentionally not created here because the coordinator restricted this task’s ownership; the implementation retains the Phase 0 VFS paths and 128 KiB limit as private constants pending that configuration slice.
- Local test/build tooling emits its existing informational Workers AI binding warning. No remote deployment or production verification occurred.
