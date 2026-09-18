# Personal Work Graph canvas local acceptance

Date: 2026-09-18

Scope: `GR-CANVAS` frontend quality gate on local `main`, covering `/graph` route registration, GraphPage/GraphCanvas wiring, dynamic Cytoscape loading, bilingual copy contracts, semantic mobile fallback, emitted chunk inventory, and local build checks. This is local implementation and verification evidence only; it is not release or production acceptance evidence.

Follow-up hardening: the route contract now structurally inspects `renderPage`'s `graph` case and `GraphRoute`'s JSX return, and the emitted inventory contract rejects Cytoscape modules in every initial static chunk with a dedicated eager-Cytoscape regression fixture.

## Verification commands

All commands below were run from the repository root with the `rtk` command prefix. No production deployment was requested or performed.

```text
rtk npm run typecheck
> tsc --noEmit

rtk npx vitest run test/unit/frontend-graph-page.test.tsx test/unit/frontend-graph-canvas.test.tsx test/unit/frontend-navigation-data.test.ts test/unit/frontend-i18n.test.ts
Test Files  4 passed (4)
Tests       19 passed (19)

rtk node --test scripts/frontend-app-contract.test.mjs scripts/i18n-contract.test.mjs scripts/wcag-contract.test.mjs
tests       21 passed (21)

rtk node --test scripts/workbench-landing-build.test.mjs
tests       34 passed (34)

rtk npm run build
Vite: built in 215ms
landing/build contract: 97 passed, 0 failed
build secret scan: pass
legacy UI audit: pass
wrangler deploy --dry-run: --dry-run: exiting now.

rtk git diff --check
exit 0; no whitespace errors
```

The first sandboxed focused Vitest run was blocked before test execution by Wrangler's local runtime permissions (`EPERM` writing `/Users/doug/Library/Preferences/.wrangler/logs/...` and `listen EPERM` on `127.0.0.1`). The first build attempt also exposed the local dependency-state issue that `cytoscape@3.33.1` was declared in `package.json` and `package-lock.json` but absent from `node_modules`; installing the already-declared dependency locally resolved it. The focused Vitest suite and the complete build were then rerun with approved local permissions and passed. The authorized build remained `wrangler deploy --dry-run`; it did not deploy.

## Contract coverage

- `shared/workspace-route-capabilities.ts` registers `{ id: "graph", path: "/graph", pageKind: "graph", availability: "ready" }`; a structured source contract inspects `frontend/app.tsx`'s `renderPage` switch and requires the `graph` case to return `GraphRoute`. A second structured contract inspects `GraphRoute` and requires its JSX return tag to be `GraphPage`.
- `frontend/pages/graph-page.tsx` imports `GraphCanvas`; the source contract scans all frontend TypeScript sources and requires `frontend/pages/graph-page.tsx` to be the only source with one `<GraphCanvas>` mount. `frontend/components/graph/graph-canvas.tsx` is the only source containing Cytoscape references, has no eager `from "cytoscape"` import, and uses exactly one `import("cytoscape")`.
- Graph source contracts reject literal `undefined` UI output and direct JSX visible copy. The `GRAPH_*` catalog keys have exact parity in both locales: 17 keys in `en` and 17 keys in `zh-CN`. The existing i18n AST/HTML verifier and graph rendering tests also pass.
- `GraphCanvas` always emits a `data-graph-fallback` semantic node list. At `@media (max-width: 48rem)`, `.graph-canvas__viewport` is hidden while the fallback list remains rendered; no mobile rule hides the fallback.

## Emitted chunk and dynamic-import evidence

The authorized Vite output generated the following inventory:

```text
initial entry: assets/index-BEGLsYDC.js
dynamic imports from manifest entry:
  pages/workbench-landing/workbench-scene-runtime.ts -> assets/workbench-scene-runtime-C7ygNY0_.js
  ../node_modules/cytoscape/dist/cytoscape.esm.mjs -> assets/cytoscape.esm-CQo7axHC.js

assets/cytoscape.esm-CQo7axHC.js
  raw: 433.45 kB
  gzip: 136375 bytes
  provenance module: node_modules/cytoscape/dist/cytoscape.esm.mjs
  initial static chunk: false

assets/workbench-scene-runtime-C7ygNY0_.js
  raw: 569.39 kB
  gzip: 143329 bytes
  initial static chunk: false
```

The landing build contract now identifies the single Cytoscape chunk, rejects a Cytoscape module in every `initialStaticKeys` chunk, and includes a minimal eager-Cytoscape fixture that must fail with `EAGER_CYTOSCAPE_MODULE`. It excludes the unrelated graph chunk from the 3D-only scene budget. The scene budget remains 143329 gzip bytes, under the 250 KiB limit. The Cytoscape chunk remains a separate dynamic descendant and is not part of the initial static JavaScript chunk.

## Release boundary and concerns

No D1 migration was created or executed. No Wrangler production deploy, remote data mutation, production smoke, signed browser acceptance, physical-device/mobile browser acceptance, or git push was performed. `SECRETS_FILE` was not read, uploaded, or modified. The Vite build retains its existing warning that the generated `index` and scene runtime chunks exceed 500 kB before gzip; this is recorded as a performance follow-up, not a failed local contract. Production/release/browser acceptance remains pending.
