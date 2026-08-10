# Final review fixes

- Restored `dev` and `deploy` npm scripts referenced by the operations documentation.
- Restored legacy note normalization: titles truncate to 160 UTF-16 code units and tags retain the first 20 entries.
- Made generated note IDs truncate on Unicode code-point and UTF-8 byte boundaries, preventing unpaired surrogates and oversized paths.
- Validated note/index paths before writing the recovery journal so expected validation failures cannot wedge future recovery.
- Added unit and real workerd regressions for compatibility and supplementary-Unicode titles followed by healthy reads and writes.

Verification: `npm run check` passed with 2 smoke contract tests, 38 unit tests, 20 workerd tests, generated type drift, TypeScript, and Wrangler dry-run. No deploy, remote smoke, or Workers AI provider call was performed.
