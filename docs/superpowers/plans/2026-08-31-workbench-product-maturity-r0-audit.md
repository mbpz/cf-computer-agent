# Workbench Product Maturity R0 Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an evidence-backed, atomic inventory of every visible workbench capability and downgrade any unsupported maturity claim before runtime redesign begins.

**Architecture:** R0 adds a machine-readable capability audit manifest and verifier beside the existing delivery ledger. Route-level tests prove discoverability and page-state wiring, while the manifest connects each visible journey to API, persistence, authorization, pagination/idempotency, and evidence. Documentation is reconciled only after the verifier fails on unsupported claims and passes on the corrected ledger.

**Tech Stack:** TypeScript 7, React 19, Vitest, Node test runner, Cloudflare Workers/D1, existing delivery-status contracts.

**Spec:** `docs/superpowers/specs/2026-08-31-workbench-product-maturity-design.md`

## Global Constraints

- Phase one owns every capability currently visible in the UI or navigation.
- Existing routes, tests, or files do not prove mature usability.
- Private data must remain scoped to the authenticated member and secondary target authorization.
- Local implementation, verification, production release, and signed-browser acceptance remain separate dimensions.
- No deployment, remote migration, production mutation, or secret access belongs to R0.
- All shell commands are prefixed with `rtk`.
- Preserve the unrelated untracked `.pnpm-store/` directory.

---

### Task 1: Add the auditable capability manifest contract

**Files:**
- Create: `shared/workbench-maturity-capabilities.ts`
- Create: `scripts/workbench-maturity-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WORKSPACE_ROUTE_CAPABILITIES` from `shared/workspace-route-capabilities.ts`.
- Produces: `WORKBENCH_MATURITY_CAPABILITIES`, `MaturityClassification`, `MaturityDimension`, and the `verify:workbench-maturity` package script.

- [ ] **Step 1: Write the failing manifest completeness test**

```js
test("every visible ready route has one maturity capability record", async () => {
  const routes = await import(pathToFileURL(routeCapabilitiesPath).href);
  const maturity = await import(pathToFileURL(maturityCapabilitiesPath).href);
  const visible = routes.WORKSPACE_ROUTE_CAPABILITIES.filter((route) => route.availability === "ready");
  assert.deepEqual(
    maturity.WORKBENCH_MATURITY_CAPABILITIES.map((item) => item.routeId).sort(),
    visible.map((route) => route.id).sort(),
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `rtk node --test scripts/workbench-maturity-contract.test.mjs`

Expected: FAIL because `shared/workbench-maturity-capabilities.ts` does not exist.

- [ ] **Step 3: Add explicit maturity types and one record per route**

```ts
export type MaturityClassification = "usable" | "partial" | "unusable" | "pseudo_entry" | "unreachable";
export type MaturityDimension = "entry" | "journey" | "api" | "persistence" | "isolation" | "query_or_idempotency" | "states" | "accessibility" | "evidence";

export interface WorkbenchMaturityCapability {
  readonly id: string;
  readonly routeId: string;
  readonly pathname: string;
  readonly requiredRole: "anonymous" | "contributor" | "admin";
  readonly journey: string;
  readonly classification: MaturityClassification;
  readonly dimensions: Readonly<Record<MaturityDimension, "proven" | "gap" | "not_applicable">>;
  readonly frontendEvidence: readonly string[];
  readonly backendEvidence: readonly string[];
  readonly testEvidence: readonly string[];
  readonly ledgerIds: readonly string[];
  readonly gaps: readonly string[];
}
```

Populate every currently ready route. Initial classifications are evidence-derived and must use `partial` whenever browser, release, or a required product dimension is not proven. Do not use an empty evidence array for a `proven` dimension.

- [ ] **Step 4: Validate record semantics**

Extend the Node contract to reject duplicate IDs/route IDs, unknown route IDs, unsupported enum values, missing evidence for `proven`, missing gap text for `gap`, and visible ready routes without records.

- [ ] **Step 5: Wire the focused verifier**

Add:

```json
"verify:workbench-maturity": "node --test scripts/workbench-maturity-contract.test.mjs"
```

- [ ] **Step 6: Run focused GREEN**

Run: `rtk npm run verify:workbench-maturity`

Expected: PASS with one unique record for every visible ready route.

- [ ] **Step 7: Commit**

```sh
rtk git add shared/workbench-maturity-capabilities.ts scripts/workbench-maturity-contract.test.mjs package.json
rtk git commit -m "test: add workbench maturity manifest"
```

### Task 2: Prove route entry, role projection, and page-state reachability

**Files:**
- Create: `test/helpers/authenticated-app-harness.tsx`
- Create: `test/unit/frontend-workbench-maturity-routes.test.tsx`
- Modify: `shared/workbench-maturity-capabilities.ts`

**Interfaces:**
- Consumes: `WORKBENCH_MATURITY_CAPABILITIES`, `App`, session fixtures, navigation fixtures, and existing request mocking helpers.
- Produces: one authenticated App journey per route and explicit anonymous/contributor/admin projection evidence.

- [ ] **Step 1: Write a failing parameterized route journey**

```tsx
// authenticated-app-harness.tsx owns the repeated Happy DOM lifecycle used by
// frontend-notifications-route.test.tsx and frontend-tasks-route.test.tsx.
export async function mountAuthenticatedApp(options: {
  url: string;
  role: "contributor" | "admin";
  permissionMask: string;
  fetch: typeof globalThis.fetch;
}): Promise<{ browser: Window; container: HTMLElement; root: Root; unmount(): Promise<void> }> {
  const browser = new Window({ url: options.url });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", browser.document);
  vi.stubGlobal("navigator", browser.navigator);
  vi.stubGlobal("history", browser.history);
  vi.stubGlobal("location", browser.location);
  vi.stubGlobal("fetch", options.fetch);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = browser.document.createElement("div") as unknown as HTMLElement;
  browser.document.body.append(container as unknown as Node);
  const root = createRoot(container);
  await act(async () => root.render(<App />));
  return {
    browser, container, root,
    async unmount() {
      await act(async () => root.unmount());
      browser.close();
      vi.unstubAllGlobals();
    },
  };
}

for (const capability of WORKBENCH_MATURITY_CAPABILITIES) {
  it(`${capability.routeId} is reachable from its rendered entry`, async () => {
    const journey = await mountAuthenticatedApp({
      url: `https://app.test${capability.pathname}`,
      role: capability.requiredRole === "admin" ? "admin" : "contributor",
      permissionMask: permissionMaskFor(capability.routeId),
      fetch: createRouteAuditFetch(capability.routeId),
    });
    const entry = journey.container.querySelector(`[data-route-id="${capability.routeId}"]`);
    expect(entry).not.toBeNull();
    entry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(window.location.pathname).toBe(capability.pathname);
    expect(journey.container.querySelector("main [data-page-state]")).not.toBeNull();
    await journey.unmount();
  });
}
```

`permissionMaskFor` is an exhaustive `Record<string, string>` fixture keyed by manifest route ID. `createRouteAuditFetch` is an exhaustive `switch` that returns `/api/session`, `/api/navigation`, telemetry, and the existing minimal valid ready response for the selected route; its `default` branch throws on every unplanned request. This keeps missing API knowledge visible instead of hiding it behind a catch-all fixture.

- [ ] **Step 2: Run and capture RED classifications**

Run: `rtk npx vitest run test/unit/frontend-workbench-maturity-routes.test.tsx`

Expected: FAIL for entries without stable selectors, incorrect role projection, missing direct route rendering, or pages without explicit state markers. Record each observed symptom in the manifest; do not alter product code in R0.

- [ ] **Step 3: Add non-mutating audit selectors only where required**

If an existing rendered entry has no stable semantic query, add `data-route-id` to the shared shell projection. Do not add an entry for an unavailable capability and do not change business behavior.

- [ ] **Step 4: Cover role and direct-route boundaries**

Add assertions that anonymous users reach Login, contributor sessions cannot render admin entries or admin pages, admin sessions see permitted administration entries, revoked permissions remove entries and reject direct navigation, and `/messages/:threadId` remains context-authorized.

- [ ] **Step 5: Cover async page states without claiming business maturity**

For each route, inject loading, empty, retryable error, and ready responses supported by its existing controller. Missing states remain manifest gaps; R0 must not add business behavior merely to make the audit green.

- [ ] **Step 6: Run focused tests and update manifest evidence**

Run: `rtk npx vitest run test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-app-routes.test.ts test/unit/workspace-shell.test.tsx`

Expected: PASS for truthful entry/reachability assertions; capability records retain gaps for unimplemented page states or journeys.

- [ ] **Step 7: Commit**

```sh
rtk git add test/helpers/authenticated-app-harness.tsx test/unit/frontend-workbench-maturity-routes.test.tsx shared/workbench-maturity-capabilities.ts frontend/components/shell/app-shell.tsx
rtk git commit -m "test: audit workbench route maturity"
```

### Task 3: Audit API, persistence, isolation, pagination, and idempotency

**Files:**
- Create: `scripts/workbench-domain-audit.mjs`
- Create: `scripts/workbench-domain-audit.test.mjs`
- Create: `docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md`
- Modify: `shared/workbench-maturity-capabilities.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: maturity records, route source files, migrations, repositories, services, and test evidence paths.
- Produces: a deterministic Markdown domain matrix and a failing verifier for missing or contradictory evidence.

- [ ] **Step 1: Write failing evidence-path and dimension tests**

```js
test("every declared evidence path exists and every visible mutation states its safety strategy", async () => {
  const records = await loadMaturityRecords();
  for (const record of records) {
    for (const path of [...record.frontendEvidence, ...record.backendEvidence, ...record.testEvidence]) {
      assert.equal(existsSync(resolve(repositoryRoot, path)), true, `${record.id}: missing ${path}`);
    }
    if (record.mutations.length > 0) {
      assert.notEqual(record.mutationSafety, "not_applicable", `${record.id}: mutation safety missing`);
    }
  }
});
```

- [ ] **Step 2: Run and verify RED**

Run: `rtk node --test scripts/workbench-domain-audit.test.mjs`

Expected: FAIL until records declare API paths, persistence/migration paths, owner predicates, pagination mode, mutation safety, and corresponding tests.

- [ ] **Step 3: Extend the manifest with domain evidence**

Add exact fields:

```ts
readonly apiPaths: readonly string[];
readonly persistencePaths: readonly string[];
readonly ownerPredicate: string | null;
readonly pagination: "numbered" | "cursor" | "not_applicable";
readonly mutations: readonly string[];
readonly mutationSafety: "idempotency_key" | "conditional_write" | "convergent_delete" | "mixed" | "not_applicable";
```

Every non-null owner predicate must name the authenticated principal field used by the repository or service. A table containing `member_id` is not sufficient evidence unless runtime queries enforce it.

- [ ] **Step 4: Generate the deterministic audit matrix**

`scripts/workbench-domain-audit.mjs` sorts records by route order and writes a Markdown table containing capability, route, API, persistence, owner predicate, pagination, mutation safety, test evidence, classification, and gaps. It must reject writing when evidence files do not exist.

- [ ] **Step 5: Add the package script and generate evidence**

```json
"audit:workbench-domain": "node scripts/workbench-domain-audit.mjs --check"
```

Run: `rtk node scripts/workbench-domain-audit.mjs --write docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md`

- [ ] **Step 6: Run focused GREEN**

Run: `rtk node --test scripts/workbench-domain-audit.test.mjs && rtk npm run audit:workbench-domain`

Expected: PASS and a deterministic evidence document with no nonexistent paths or unsupported `proven` dimensions.

- [ ] **Step 7: Commit**

```sh
rtk git add scripts/workbench-domain-audit.mjs scripts/workbench-domain-audit.test.mjs shared/workbench-maturity-capabilities.ts docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md package.json
rtk git commit -m "docs: audit workbench domain boundaries"
```

### Task 4: Reconcile the authoritative checklist and delivery ledger

**Files:**
- Modify: `docs/product/workbench-product-maturity-checklist.md`
- Modify: `docs/product/delivery-status-ledger.md`
- Modify: `scripts/delivery-status-contract.test.mjs`
- Modify: `scripts/workbench-maturity-contract.test.mjs`

**Interfaces:**
- Consumes: route and domain audit outcomes from Tasks 1–3.
- Produces: truthful checklist status, ledger mappings, and contracts preventing unsupported maturity promotion.

- [ ] **Step 1: Write failing checklist/manifest reconciliation tests**

```js
test("checked maturity atoms are backed by proven manifest dimensions", () => {
  for (const atom of parseMaturityChecklist(checklistText)) {
    if (atom.checked) {
      const linked = records.filter((record) => atom.ledgerIds.includes(record.ledgerId));
      assert.ok(linked.length > 0, `${atom.id}: no capability evidence`);
      assert.ok(linked.every(allRequiredLocalDimensionsProven), `${atom.id}: unsupported checked state`);
    }
  }
});
```

- [ ] **Step 2: Run and verify RED**

Run: `rtk npm run verify:workbench-maturity`

Expected: FAIL while checklist atoms lack structured manifest/ledger mappings.

- [ ] **Step 3: Add explicit atom mappings**

Each R0 atom receives `implementation`, `verification`, `release`, and `acceptance` evidence references. Mark `[x]` only when local implementation and verification are proven. Use `[-]` for locally proven capabilities whose release or signed acceptance remains incomplete. Keep unsupported capabilities `[ ]`.

- [ ] **Step 4: Downgrade unsupported ledger claims**

Compare each ledger row against the generated matrix. Change only dimensions contradicted by current evidence. Preserve dated historical evidence with its original bounded scope. Do not promote any production dimension in R0.

- [ ] **Step 5: Enforce maturity language boundaries**

Extend `delivery-status-contract.test.mjs` so README, ROADMAP, frontend checklist, and maturity checklist cannot call a capability complete when the corresponding ledger implementation/verification is incomplete, and cannot call it released or accepted without scoped dated evidence.

- [ ] **Step 6: Run focused reconciliation gates**

Run: `rtk npm run verify:workbench-maturity && rtk npm run verify:delivery-status`

Expected: PASS with no unsupported checked atom or aggregate completion statement.

- [ ] **Step 7: Commit**

```sh
rtk git add docs/product/workbench-product-maturity-checklist.md docs/product/delivery-status-ledger.md scripts/delivery-status-contract.test.mjs scripts/workbench-maturity-contract.test.mjs
rtk git commit -m "docs: reconcile workbench maturity status"
```

### Task 5: Produce the R1–R8 dependency and execution matrix

**Files:**
- Create: `docs/product/workbench-product-maturity-gap-matrix.md`
- Modify: `docs/product/workbench-product-maturity-checklist.md`
- Modify: `ROADMAP.md`
- Modify: `scripts/workbench-maturity-contract.test.mjs`

**Interfaces:**
- Consumes: reconciled capability classifications and gap lists.
- Produces: ordered, independently testable phase slices with exact dependencies and exit criteria.

- [ ] **Step 1: Write a failing gap-accounting test**

```js
test("every manifest gap is owned by exactly one future atom", () => {
  const gaps = records.flatMap((record) => record.gaps.map((gap) => `${record.id}:${gap}`));
  const owners = parseGapOwners(gapMatrixText);
  assert.deepEqual([...owners.keys()].sort(), gaps.sort());
  assert.ok([...owners.values()].every((atomIds) => atomIds.length === 1));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `rtk npm run verify:workbench-maturity`

Expected: FAIL because no gap matrix owns the recorded gaps.

- [ ] **Step 3: Write the dependency matrix**

For every gap, record capability, observed symptom, violated maturity dimension, owner atom, prerequisite atoms, affected files, focused test, acceptance journey, and priority. Order P0 user-blocking and authorization failures before visual refinement.

- [ ] **Step 4: Reconcile ROADMAP stages**

Map R1–R8 to the approved design without deleting historical roadmap evidence. Each stage states entry criteria, independent exit criteria, and the next detailed plan filename to be created when execution reaches that stage.

- [ ] **Step 5: Run focused and documentation gates**

Run: `rtk npm run verify:workbench-maturity && rtk npm run verify:delivery-status && rtk git diff --check`

Expected: PASS; every gap has one owner and no atom has an unresolved dependency on a later phase.

- [ ] **Step 6: Commit**

```sh
rtk git add docs/product/workbench-product-maturity-gap-matrix.md docs/product/workbench-product-maturity-checklist.md ROADMAP.md scripts/workbench-maturity-contract.test.mjs
rtk git commit -m "docs: sequence workbench maturity gaps"
```

### Task 6: Run the complete local gate and close R0

**Files:**
- Create: `docs/operations/evidence/2026-08-31-workbench-r0-completion.md`
- Modify: `docs/product/workbench-product-maturity-checklist.md`
- Modify: `docs/product/delivery-status-ledger.md`

**Interfaces:**
- Consumes: exact final R0 commit tree and all R0 focused verifiers.
- Produces: bounded local R0 completion evidence and the approved input for the R1 design-system implementation plan.

- [ ] **Step 1: Run all R0 focused gates**

```sh
rtk npm run verify:workbench-maturity
rtk npm run audit:workbench-domain
rtk npm run verify:delivery-status
rtk npx vitest run test/unit/frontend-workbench-maturity-routes.test.tsx
```

Expected: all commands exit 0.

- [ ] **Step 2: Run the complete project gate**

Run: `rtk npm run check`

Expected: exit 0. Local loopback tests may require an approved unsandboxed run; Cloudflare AI-binding and intentional fault-fixture warnings remain warnings rather than failures.

- [ ] **Step 3: Verify repository scope**

Run: `rtk git diff --check && rtk git status --short`

Expected: no tracked worktree changes outside R0 artifacts; unrelated `.pnpm-store/` remains untracked and untouched.

- [ ] **Step 4: Record bounded evidence**

The evidence document records exact commit, commands, counts, classifications, unresolved gaps, and explicit statements that R0 did not deploy, apply remote migrations, or perform signed production browser acceptance.

- [ ] **Step 5: Mark only R0 atoms supported by evidence**

Update `R0-001` through `R0-012` from `[ ]` to `[x]` only when their generated artifacts and contracts pass. Do not change R1–R8 implementation atoms.

- [ ] **Step 6: Run the documentation gates again**

Run: `rtk npm run verify:workbench-maturity && rtk npm run verify:delivery-status && rtk git diff --check`

Expected: PASS after final status synchronization.

- [ ] **Step 7: Commit**

```sh
rtk git add docs/operations/evidence/2026-08-31-workbench-r0-completion.md docs/product/workbench-product-maturity-checklist.md docs/product/delivery-status-ledger.md
rtk git commit -m "docs: close workbench maturity R0 audit"
```
