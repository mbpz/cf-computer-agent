# Workbench R0 local completion evidence

Evidence recorded: 2026-09-01

## Scope

This document records both the original local R0 audit closure at commit `d536c606d74b8c2c0aa9ee732b4ca20b7e0b00ac` (`test: stabilize review clock`) and the final-fix I1 operation-accounting correction layered on that audited baseline. It certifies only the audit artifacts and local verification commands listed below. It does not certify product maturity, production release, remote schema state, or signed production browser acceptance.

The historical complete-project gate remains anchored to its exact pre-documentation tree. The final-fix I1 commit is reported by Git history and the ignored execution report because a tracked file cannot safely contain its own commit hash. The focused I1 gates below are therefore explicitly separate from the historical complete-project gate.

## Independently approved prerequisite

The first complete-gate attempt exposed a wall-clock-dependent Worker review fixture. The independently approved prerequisite commit `d536c606d74b8c2c0aa9ee732b4ca20b7e0b00ac` added the existing `ReviewService` clock seam to `AppDependencies.reviewNow` in `src/app.ts` and made `test/worker/review.test.ts` use its fixed `2026-08-26T12:00:00.000Z` fixture clock.

That prerequisite changed exactly:

- `src/app.ts`
- `test/worker/review.test.ts`

Task 6 did not absorb the clock fix into its documentation commit and did not classify the earlier red gate as a warning. Every command below was rerun fresh after the prerequisite landed.

## Audited inventory at closure

- 21 visible menu routes and 3 parameterized deep-link capabilities are present in the maturity manifest.
- All 24 capabilities remain classified `partial` under the nine-dimensional product maturity standard.
- The future-work matrix contains 57 unresolved gaps: 24 manifest aggregate gaps and 33 domain operation-safety gaps.
- Priority distribution is P0/P1/P2 = 25/31/1.
- R1–R8 owner distribution is 1/1/14/8/4/27/1/1.
- The R0 checklist remains evidence-derived: 7 atoms are `[x]` and 5 atoms are `[-]`.
- All 98 R1–R8 implementation atoms remain `[ ]`.
- Every R0 release and acceptance field remains `pending`.

The five partial R0 atoms (`R0-002`, `R0-005`, `R0-006`, `R0-007`, and `R0-008`) are intentionally not promoted. Their missing control inventory, list semantics, mutation convergence, secondary authorization, and DTO/service-chain evidence are part of the recorded future work; a successful repository gate does not manufacture those proofs.

Final-fix I1 temporarily returned `R0-012` to non-complete during the RED phase. It was restored only after explicit operation roots, capability-owned strategy bindings, source-side-effect bindings, all-record declaration-to-fact coverage, and the regenerated 57-gap matrix passed the corrected contracts. No R1–R8 implementation atom, release field, or acceptance field was promoted.

The accounting correction has four concrete effects:

- `POST /api/discussions/messages` is now discovered through the actual `DiscussionThreadRoute` root and has an exact generated fact, declaration, strategy binding, and test proof; it does not add a future-work gap.
- `GET /api/knowledge/:id#record-visit` is an independently identified source side effect with exact source and test evidence; ordinary read-only GET requests remain outside mutation accounting.
- the admin submissions queue's publish, request-revision, and reject operations are independently declared and accounted instead of being hidden by another capability's use of the same endpoint paths.
- missing declared roots, orphan declarations, orphan strategy bindings, and generated facts without declarations now fail closed.

## Fresh focused gates

All commands ran with the required `rtk` prefix from `/Users/doug/ai/system/cf-computer-agent/.worktrees/workbench-maturity-r0` on the tested tree.

| Command | Result |
| --- | --- |
| `rtk node --test scripts/workbench-domain-audit.test.mjs` | PASS, 19/19 tests |
| `rtk npm run audit:workbench-domain` | PASS, generated domain evidence current |
| `rtk npm run verify:workbench-maturity` | PASS, 13/13 tests |
| `rtk npm run verify:delivery-status` | PASS, 28/28 tests |
| `rtk npm run typecheck` | PASS, `tsc --noEmit` |
| `rtk git diff --check` | PASS |

These final-fix I1 commands were rerun on the corrected working tree after regeneration. They are the current operation-accounting closure evidence; they do not supersede the historical full-project gate below with a claim that the entire project gate was rerun for I1.

## Fresh complete project gate

Command:

```sh
rtk npm run check
```

Historical result: PASS on `d536c606d74b8c2c0aa9ee732b4ca20b7e0b00ac`. Final-fix I1 did not rerun this complete-project command and does not restate it as current-tree evidence.

| Gate | Result |
| --- | --- |
| vendored browser dependencies | PASS; `markdown-it@15.0.0` and `dompurify@3.4.14` hashes matched |
| Wrangler generated types | PASS; `worker-configuration.d.ts` current under Wrangler 4.119.0 |
| TypeScript | PASS; `tsc --noEmit` |
| smoke/contracts | PASS, 48/48 |
| i18n contract | PASS, 13/13 |
| i18n static verifier | PASS, 434 keys / 55 placeholders / 6 files |
| delivery-status contract inside full gate | PASS, 28/28 |
| frontend/unit Vitest | PASS, 178 files / 1567 tests |
| Worker Vitest | PASS, 28 files / 457 tests |
| frontend production builds | PASS twice, 4713 modules transformed each run |
| build secret scan | PASS |
| legacy frontend audit | PASS, 4 rollback files retained and no source/dist references |
| Wrangler deployment build check | PASS, `wrangler deploy --dry-run` exited without deployment |

The generated frontend assets included a `779.37 kB` minified JavaScript chunk (`235.32 kB` gzip). Wrangler dry-run read 7 asset files and reported a prospective upload size of `1282.27 KiB` (`243.06 KiB` gzip), then exited because `--dry-run` was set.

## Warnings and expected diagnostic output

The following did not fail the gate and are not promoted to acceptance evidence:

- Cloudflare tooling repeatedly warned that AI bindings can access remote resources and may incur usage charges in local development. Task 6 did not request an AI call, deployment, control-plane mutation, or other Cloudflare remote action.
- Worker fault-injection fixtures emitted expected missing-workspace-file and invalid-pending-journal diagnostics while their containing tests passed.
- Vite warned that the `779.37 kB` minified JavaScript chunk exceeds 500 kB.
- Wrangler 4.119.0 reported that 4.127.1 is available.

No warning was reclassified as a passing assertion; the command's zero exit status and the explicit test counts above are the completion evidence.

## Delivery boundary

R0 performed no deployment, push, merge, remote D1 migration, production mutation, secret access, production smoke, signed automation run, or signed production browser journey. The Wrangler command was a local `--dry-run`; it produced no deployed Worker version or traffic change.

Consequently:

- 24 capabilities remain `partial`.
- 57 gaps remain scheduled across R1–R8.
- R1–R8 implementation status remains unchanged.
- release and acceptance remain governed by `docs/product/delivery-status-ledger.md` and are not promoted by this document.

## Ruling

Ruling: R0 closure plus final-fix I1 certifies complete local operation accounting and green focused contracts, not mature product completion — cost if wrong: readers could treat 24 partial capabilities and 57 scheduled gaps as implemented, released, or accepted work.
