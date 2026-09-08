# Public knowledge studio — implementation checkpoint

Date: 2026-09-08. Branch: `codex/ai-workbench-3d-landing`.

This is a local implementation checkpoint, not a release or a declaration that every acceptance criterion has passed.

Checkpoint was committed as `523d555`. Subsequent fixes and final local verification are tracked separately in [local-acceptance.md](./local-acceptance.md), recorded September 8, 2026 (UTC). The open-at-checkpoint list below is retained as historical evidence, not current status.

## Included

- Original Blender-generated studio, source generator, isolated source scene, GLB and responsive static posters; existing Blender scene preservation and repeat-generation evidence.
- Anonymous-root experience, bilingual fictional journey, five feature entry points, cited source panel, task completion and replay. Authenticated routes retain the existing workbench.
- Lazy Three.js runtime, responsive poster fallback, reduced-motion/static controls, bounded loading attempts and disposal, page-owned demo state and animation pause.
- Targeted asset, runtime, state, interaction, routing and Worker static-serving regressions.
- Desktop/mobile/citation/dark-static screenshots in `acceptance/`.

## Verification observed before checkpoint

- Actual model: 650,596 bytes, 33,716 triangles, 54 material primitives. Desktop/mobile posters: 49,500 / 29,460 bytes.
- Fresh integrated UI build passed; initial scene-exclusive measurement was 142,785 gzip bytes. Build provenance enforcement remains under review and this measurement is not a completed isolation gate.
- Page and routing regressions passed 18 tests after theme initialization correction; strengthened routing network-boundary suite subsequently passed 11 tests.
- Earlier integrated page/routing/Worker-asset run passed 49 tests. The animation implementer subsequently reported 140 tests across all eight landing suites, both typechecks and a fresh UI build passing; scene-exclusive gzip was 143,275 bytes. Independent animation review and controller final rerun remain pending.
- Browser: desktop complete journey and five feature panels, cited paragraph return, English switch, 390px modal, 320px static view, dark/reduced-motion fallback checked locally. Model-request blocking reached error fallback with no canvas. These are local browser observations, not signed production acceptance or physical-phone performance measurements.

## Still open at checkpoint

- Independently review completed bounded action animations; implement and review Load/Retry/Static keyboard-focus restoration.
- Strengthen the build gate with module provenance, real source-asset verification and emitted-byte correspondence; rerun a fresh build afterward.
- Consolidate final reviews, regression evidence and the approved checklist. Physical-device frame-rate acceptance and production release remain unverified.
- Full `npm run check` is **not green**: 40 Worker failures were reproduced in existing tests that issue seven-day sessions on August 26/30 while request authentication uses the September 8 clock. The relevant implementation and ten failing test files match baseline `37ffb15`. Sessions expired September 2/6; authentication correctly returns 401. No production authentication change or unrelated test-clock repair is included.

No push, merge, deployment, production migration or secret upload has been performed for this checkpoint.
