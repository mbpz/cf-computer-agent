# Public knowledge studio — local acceptance

Verification recorded 2026-09-08 (UTC), following local checkpoint `523d555` on `codex/ai-workbench-3d-landing`. This report covers local implementation and bounded acceptance only. No push, merge, deployment, remote migration or secret upload was performed.

## Implementation and review

- Original procedural Blender studio, isolated source scene, repeatable generation script, GLB and desktop/mobile posters are complete. Original-scene preservation and repeat-generation evidence are in `asset-report.json`, `generation-report.json` and `original-scene-snapshot.json` in this directory.
- Only anonymous `/` uses the new page. Anonymous deep links and session-error behavior retain the existing login boundary; authenticated routes retain the workbench. The demo is explicitly fictional, memory-only and bilingual; it does not call AI or read/write member data.
- Six-stage journey, five feature buttons, two cited source documents, local task completion, replay, focus-trapped panels, outside click/Escape, language retention, theme, lazy 3D and static fallback are implemented.
- Post-checkpoint fixes restore keyboard focus when Load/Retry/Static controls are replaced; preserve network interception from before rendering through unmount; and reset/rearm all visual actors on an explicit page-owned cycle counter. Ordinary feature navigation does not reset the scene. Reviewers closed the routing lifecycle and replay findings and approved the focus correction.
- Build checks now use emitted module provenance and chunk digests, recursively account for static/dynamic scene descendants, invoke the real asset inspector and require emitted assets to match inspected source bytes. This is local trusted-build evidence, not an adversarial cryptographic attestation.
- Independent build-gate review approved R1/R2, including nine in-memory rejection probes and a read-only actual-output test. That review measured the earlier 143,276-byte scene output; the controller subsequently built and verified the final 143,329-byte output below. Page cycle integration also passed independent source review.

## Automatic verification

| Check | Observed result |
| --- | --- |
| `npm run typecheck` and `npm run typecheck:landing` | Passed after the cycle integration |
| `npm run build` | Passed: fresh UI build, 96 landing/MCP/asset/build tests, public-output secret scan, legacy audit, Worker **dry-run** |
| Page + routing + runtime + wrapper + Worker assets | 150 tests passed across five files after post-checkpoint fixes |
| Worker assets, separate post-build rerun | 33 tests passed after the final build completed |
| Complete `npm run test:unit` | Passed before the final cycle change; final changed paths were rerun in the 150-test integration set |
| Workbench maturity verification / domain audit | Passed (maturity verification: 13 tests) |
| Full `npm run check` | **Failed**, with 40 existing Worker session-fixture failures; not waived by focused passing tests |

The full-gate failures were reproduced twice: 40 failed / 59 passed across 13 Worker files. Ten failing test files and relevant authentication sources matched baseline `37ffb15`. Fixed seven-day sessions issued on August 26/30 expired September 2/6, while request authentication used the September 8 clock. Those requests correctly returned 401. No production session-lifetime change, authentication bypass or unrelated test-clock repair is included. A separate test-fixture repair and complete gate rerun remain required before claiming a green project gate.

Existing dependency-install audit reported 4 vulnerabilities (3 moderate, 1 high); no automatic dependency upgrades were applied. Vite's advisory for minified chunks above 500 kB remains visible. Workers tests print existing remote-AI-binding warnings; these mocked demo regressions do not invoke AI. The Worker binary-serving harness also prints `.text()` warnings while the added assertions inspect actual binary bytes.

## Assets and measured budgets

| Artifact | Actual evidence |
| --- | --- |
| `frontend/assets/workbench-landing/workbench.glb` | 650,596 bytes; 33,716 triangles; 54 material primitives; no embedded textures |
| Desktop poster | 49,500 bytes; 1600 × 1000 |
| Mobile poster | 29,460 bytes; 900 × 1100 |
| Final scene-exclusive JavaScript | 143,329 gzip bytes; threshold 256,000 bytes; actual transitive graph gate passed |
| Final runtime output | `assets/workbench-scene-runtime-Bc33v_3O.js` |
| Final entry output | `assets/index-Bv6-DTjE.js`; Three/runtime excluded from its initial static module closure |

The gzip value uses Node's `gzipSync`, the same metric as the gate; Vite's displayed gzip estimate may differ. Development renderer diagnostics showed 54 draw calls, 33,716 triangles, 54 geometries and 0 textures at DPR 1, with frame count stable while idle. These measurements are not a physical-phone frame-rate test.

The generation script is `scripts/blender/workbench-landing.py`; source `.blend`, audits and generation evidence remain under `design/workbench-landing/`. Only the model and posters are public frontend assets. The source `.blend` and generation reports are not frontend assets.

## Browser observations and limits

Local Codex in-app browser, with preview-only session-401/pageview-204 fixtures. Other business API requests are denied by the preview. This is not production authentication acceptance. The separately tested Worker SELF asset responses cover hashed GLB/WebP 200 and binary formats, unknown asset 404, anonymous knowledge 401 and contributor-admin 403.

- Development: 1440 × 900 desktop journey, five panels, citations and English switch; 390 × 844 English citation panel within viewport; 320 px static view without horizontal overflow; dark/reduced-motion static fallback; blocked model request reached error fallback with no canvas.
- Built-output preview: 1280 × 720 dark mode with one ready canvas, complete collect/read/answer/citation/task journey, Tab/Shift+Tab wrap and Escape focus return; anonymous deep link retained login. Following the final build, collect → replay reset the HTML gate and retained one ready canvas. Actor transform/rearm correctness is asserted by the runtime tests, not inferred from this DOM observation.
- Screenshots in `acceptance/`: `desktop-overview.png`, `desktop-citation.png`, `mobile-citation.png`, `static-320.png`, `dark-reduced-motion.png`, `production-dark-overview.png`. The final production-named screenshot means **local built-output preview**, not a deployed domain.
- Temporary network-block/cache/service-worker overrides, media emulation and viewport sizing were restored. Local previews use ports 5173 (development) and 5174 (built output); no OAuth flow was submitted.

Still unverified: the complete per-size bilingual journey matrix, actual 200% browser zoom, physical touch/phone testing and 60/30 fps targets; browser-observed eight-second delay, disabled WebGL and Save-Data; ten real route reentries with GPU/listener accounting. Automated fallback/timeout/cleanup tests are not substituted for those browser/device observations. S5-04/S5-06 and plan 9.4–9.6 therefore remain partially open.

## Delivery boundary

Implementation and local focused gates are complete, subject to the recorded browser/device gaps and existing failing full gate. All S6 release tasks remain unchecked. Merge/deploy, formal-domain smoke and authorized signed-role browser acceptance require a separate release decision.
