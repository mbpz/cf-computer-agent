import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { collectFrontendOperations, renderOperationInventory } from "./frontend-operation-inventory.mjs";

function fixture(files, run) {
  const root = mkdtempSync(join(tmpdir(), "operation-inventory-"));
  try {
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({compilerOptions: {jsx: "react-jsx", noEmit: true}, include: ["**/*.tsx", "**/*.ts"]}));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), {recursive: true});
      writeFileSync(join(root, path), text);
    }
    return run(root);
  } finally { rmSync(root, {recursive: true, force: true}); }
}

const source = `
// <button onClick={notReal}>not a control</button>
const markup = '<button onClick={alsoNotReal}>not a control</button>';
export function Page({ ready, pending, open, rows, send, close }) {
  if (!ready) return <button onClick={reload}>retry</button>;
  return <section>{open && <Dialog open={open} onOpenChange={close}>
    {pending ? <button disabled>wait</button> : <Button onClick={send} disabled={pending}>Send</Button>}
    {rows.map(row => <a key={row.id} href={row.href}>{row.title}</a>)}
    <form onSubmit={send}><input type="file" onChange={pick} /><button type="submit">Go</button></form>
    <div {...actions} role="button" tabIndex={0} />
  </Dialog>}</section>;
}
export function Empty() { return <p>Nothing interactive</p>; }
`;

test("enumerates native/custom controls, navigation, submits and spread boundaries, not text/comment decoys", () => fixture({"frontend/page.tsx":source}, root => {
  const result = collectFrontendOperations({repositoryRoot:root});
  assert.equal(result.files.length, 1);
  const ops = result.operations;
  assert.equal(ops.length, 9);
  assert.ok(ops.every(op => op.owner === "Page"));
  assert.ok(!JSON.stringify(ops).includes("notReal"));
  assert.ok(ops.some(op => op.tag === "button" && op.attributes.type === '\"submit\"' && !op.handlers.onClick));
  assert.deepEqual(ops.find(op => op.tag === "div").spreads, ["actions"]);
  assert.equal(ops.find(op => op.tag === "input").handlers.onChange, "pick");
  assert.equal(ops.find(op => op.tag === "a").attributes.href, "row.href");
  assert.equal(new Set(ops.map(op => op.id)).size, ops.length);
}));

test("records modal ancestry, exact branch sides, early-return guards and repeated templates", () => fixture({"frontend/page.tsx":source}, root => {
  const {operations} = collectFrontendOperations({repositoryRoot:root});
  const send = operations.find(op => op.tag === "Button");
  assert.ok(send.context.some(c => c.kind === "branch" && c.expression === "pending" && c.branch === "false"));
  assert.ok(send.context.some(c => c.kind === "logical" && c.expression === "open" && c.operator === "&&"));
  assert.ok(send.context.some(c => c.kind === "container" && c.tag === "Dialog" && c.attributes.open === "open"));
  assert.ok(send.earlyReturns.some(c => c.condition === "!ready"));
  assert.ok(operations.find(op => op.tag === "a").context.some(c => c.kind === "repeat" && c.expression === "rows"));
  const wait = operations.find(op => op.attributes.disabled === "true");
  assert.ok(wait.context.some(c => c.branch === "true"));
  assert.ok(send.line > 1 && send.column > 0);
}));

test("includes imperative listeners and zero-operation source files; deterministic output", () => fixture({
  "frontend/hooks.ts": `export function keys() { document.addEventListener("keydown", key); cy.on("tap", "node", select); }`,
  "frontend/empty.tsx": `export const Empty = () => <p>empty</p>;`,
}, root => {
  const a = collectFrontendOperations({repositoryRoot:root});
  const b = collectFrontendOperations({repositoryRoot:root});
  assert.deepEqual(a,b);
  assert.equal(a.files.length,2);
  assert.equal(a.operations.length,2);
  assert.equal(a.operations[0].kind,"listener");
  assert.equal(a.operations[0].event,'"keydown"');
  assert.equal(a.operations[1].event,'"tap"');
  assert.match(renderOperationInventory(a), /不是.*验收/);
  assert.match(renderOperationInventory(a), /frontend\/empty.tsx/);
}));

test("fails on malformed syntax rather than publishing a partial inventory", () => fixture({"frontend/broken.tsx":"export function Broken( { return <button>"}, root => {
  assert.throws(() => collectFrontendOperations({repositoryRoot:root}), /syntax|parse/i);
}));

test("route candidates follow root symbols and imported aliases, not every control in a shared app file", () => fixture({
  "shared/workbench-maturity-capabilities.ts": `export const WORKBENCH_MATURITY_CAPABILITIES = Object.freeze([
    {id:"a",pathname:"/a"}, {id:"b",pathname:"/b/:id",routePattern:"^/b/[^/]+$"}
  ]); export const WORKBENCH_OPERATION_ROOTS = Object.freeze([
    {capabilityId:"a",path:"frontend/app.tsx",symbol:"A"},
    {capabilityId:"b",path:"frontend/app.tsx",symbol:"B"}
  ]);`,
  "frontend/app.tsx": `import {Child as Alias} from "./child";
    export function A() { return <Alias onConfirm={save} />; }
    export function B() { return <button onClick={remove}>remove</button>; }
    export function Unwired() { return <button onClick={unwired}>unwired</button>; }`,
  "frontend/child.tsx": `export function Child() { return <button onClick={confirm}>confirm</button>; }`,
}, root => {
  const result = collectFrontendOperations({repositoryRoot:root});
  assert.equal(result.routes.length,2);
  assert.equal(result.routes[1].pathname,"/b/:id");
  assert.equal(result.routes[1].routePattern,"^/b/[^/]+$");
  const route = result.routes.find(r=>r.id === "a");
  assert.ok(route.candidateOperationIds.some(id=>id.startsWith("frontend/child.tsx:")));
  const remove = result.operations.find(op=>op.handlers.onClick === "remove");
  assert.ok(!route.candidateOperationIds.includes(remove.id));
  assert.ok(result.routes.find(r=>r.id === "b").candidateOperationIds.includes(remove.id));
  const unwired = result.operations.find(op=>op.handlers.onClick === "unwired");
  assert.ok(result.unassignedOperationIds.includes(unwired.id));
}));

test("keeps VM JavaScript listeners in scope and resolves referenced local classes", () => fixture({
  "frontend/vm.mjs": `export function runtime() { window.addEventListener("message", receive); }`,
  "frontend/app.tsx": `import {ErrorType} from "./error"; export function A() { const error = new ErrorType(); return <button onClick={error.retry}>Retry</button>; }`,
  "frontend/error.ts": `export class ErrorType extends Error { retry() {} }`,
  "shared/workbench-maturity-capabilities.ts": `export const WORKBENCH_MATURITY_CAPABILITIES = [{id:"a",pathname:"/a"}]; export const WORKBENCH_OPERATION_ROOTS = [{capabilityId:"a",path:"frontend/app.tsx",symbol:"A"}];`,
}, root => {
  const result = collectFrontendOperations({repositoryRoot:root});
  assert.ok(result.files.includes("frontend/vm.mjs"));
  assert.ok(result.operations.some(op=>op.path === "frontend/vm.mjs" && op.event === '\"message\"'));
  assert.deepEqual(result.routes[0].unresolvedSymbols,[]);
}));

test("real repository includes exact-result controls and both secondary confirmation actions", () => {
  const result = collectFrontendOperations({repositoryRoot:resolve(import.meta.dirname,"..")});
  const confirmation = result.operations.filter(op => op.path === "frontend/components/ui/confirm-action.tsx");
  assert.ok(confirmation.some(op => op.handlers.onClick === "onCancel"));
  assert.ok(confirmation.some(op => op.handlers.onClick === "onConfirm"));
  assert.ok(result.operations.some(op => op.path === "frontend/pages/messages/thread-page.tsx" && op.handlers.onClick === "() => void onLookup()"));
  assert.ok(result.files.includes("frontend/features/environments/environments-page.tsx"));
  assert.equal(result.routes.length,34);
  assert.ok(result.routes.every(route=>route.candidateOperationIds.length > 0));
  assert.ok(result.routes.some(route=>route.pathname === "/environments"));
  assert.ok(result.operations.some(op => op.path === "frontend/components/shell/command-palette.tsx" && op.kind === "listener"));
  const json = readFileSync(resolve(import.meta.dirname,"../docs/product/frontend-operation-inventory.json"),"utf8");
  assert.deepEqual(JSON.parse(json),result,"operation inventory is stale; regenerate deliberately");
  assert.equal(readFileSync(resolve(import.meta.dirname,"../docs/product/frontend-operation-inventory.md"),"utf8"),renderOperationInventory(result));
});

test("retains single-quoted and computed role boundaries", () => fixture({
  "frontend/roles.tsx": `export function Roles() { return <><div role='button' /><div role={role} /></>; }`,
}, root => {
  const result = collectFrontendOperations({repositoryRoot:root});
  assert.equal(result.operations.length,2);
}));
