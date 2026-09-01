import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { API } from "typescript/unstable/sync";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isClassDeclaration,
  isFunctionDeclaration,
  isIdentifier,
  isIfStatement,
  isImportDeclaration,
  isMethodDeclaration,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isStringLiteral,
  isVariableDeclaration,
} from "typescript/unstable/ast/is";

const DEFAULT_EVIDENCE_PATH = "docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md";
const DOMAIN_KEYS = new Set(["id", "apiPaths", "persistencePaths", "ownerPredicate", "pagination", "mutations", "mutationSafety"]);
const FRONTEND_INDEX_CACHE = new Map();
const ROUTE_EVIDENCE_CACHE = new Map();

const symbolBinding = (path, symbol, ...tokens) => ({ path, symbol, tokens });
const ownerEvidence = (predicate, ...bindings) => ({ predicate, bindings });
const OWNER_EVIDENCE = Object.freeze(Object.fromEntries([
  ownerEvidence("routeLibraryApi derives authenticated scope.memberId; RecentVisitsRepository predicates knowledge_visits.member_id = ? with scope.memberId.", symbolBinding("src/routes/library.ts", "routeLibraryApi", "scope.memberId"), symbolBinding("src/recent-visits/repository.ts", "RecentVisitsRepository.list", "v.member_id = ?", "scope.memberId")),
  ownerEvidence("routeMemberApi passes authenticated member.memberId as submitterId; SubmissionsRepository scopes idempotency replay and writes by submitter_id.", symbolBinding("src/routes/member.ts", "routeMemberApi", "member.memberId"), symbolBinding("src/submissions/repository.ts", "SubmissionsRepository.findByIdempotencyKey", "submitterId", "idempotencyKey")),
  ownerEvidence("routeLibraryApi derives authenticated scope.memberId; LibraryRepository authorization binds scope.memberId before applying revision visibility predicates.", symbolBinding("src/routes/library.ts", "routeLibraryApi", "scope.memberId"), symbolBinding("src/library/repository.ts", "LibraryRepository.authorizeScope", "scope.memberId")),
  ownerEvidence("routeLibraryApi derives authenticated scope.memberId; LibraryRepository search binds scope.memberId through the authorized member CTE before visibility filtering.", symbolBinding("src/routes/library.ts", "routeLibraryApi", "scope.memberId"), symbolBinding("src/library/repository.ts", "LibraryRepository.search", "scope.memberId")),
  ownerEvidence("routeLibraryApi derives authenticated scope.memberId; ChatConversationService and ChatRepository bind owner_member_id to scope.memberId for conversation reads and writes.", symbolBinding("src/routes/library.ts", "routeLibraryApi", "scope.memberId"), symbolBinding("src/chat/repository.ts", "ChatRepository.find", "owner_member_id", "ownerMemberId")),
  ownerEvidence("routeMemberApi passes authenticated member.memberId to SubmissionsService.listOwn; SubmissionsRepository predicates submissions.submitter_id = ? for both items and total.", symbolBinding("src/routes/member.ts", "routeMemberApi", "member.memberId", "listOwn"), symbolBinding("src/submissions/repository.ts", "SubmissionsRepository.listOwned", "submitter_id = ?")),
  ownerEvidence("routeTasksApi passes authenticated member.memberId to TasksService; TasksRepository predicates tasks.member_id = ? and task child tables by member_id.", symbolBinding("src/routes/tasks.ts", "routeTasksApi", "member.memberId"), symbolBinding("src/tasks/repository.ts", "TasksRepository.list", "member_id = ?")),
  ownerEvidence("routeTasksApi passes authenticated member.memberId to TasksService; board lists and status updates remain predicates on tasks.member_id = ?.", symbolBinding("src/routes/tasks.ts", "routeTasksApi", "member.memberId"), symbolBinding("src/tasks/repository.ts", "TasksRepository.compareAndSetStatus", "member_id = ?", "expectedStatus")),
  ownerEvidence("routeNotificationsApi passes authenticated member.memberId as recipientMemberId; NotificationsRepository predicates recipient_member_id = ? for items, total, and writes.", symbolBinding("src/routes/notifications.ts", "routeNotificationsApi", "member.memberId"), symbolBinding("src/notifications/repository.ts", "NotificationsRepository.list", "recipient_member_id = ?")),
  ownerEvidence("routeDiscussionsApi passes authenticated member.memberId as actorMemberId; DiscussionTargetAuthorization rechecks task ownership or current knowledge visibility before listing or writing.", symbolBinding("src/routes/discussions.ts", "routeDiscussionsApi", "member.memberId"), symbolBinding("src/discussions/service.ts", "DiscussionsService.listThreads", "memberId")),
  ownerEvidence("routeLibraryApi derives authenticated scope.memberId; reader, favorite, private-note, and visit repositories bind scope.memberId and re-authorize the current knowledge revision.", symbolBinding("src/routes/library.ts", "routeLibraryApi", "scope.memberId"), symbolBinding("src/library/repository.ts", "LibraryRepository.findCurrent", "scope")),
  ownerEvidence("routeDiscussionsApi passes authenticated member.memberId as actorMemberId; DiscussionTargetAuthorization rechecks the thread context before message reads and sends.", symbolBinding("src/routes/discussions.ts", "routeDiscussionsApi", "member.memberId"), symbolBinding("src/discussions/service.ts", "DiscussionsService.sendMessage", "memberId")),
].map((fact) => [fact.predicate, fact])));
export function runtimeEvidenceSnapshot({ repositoryRoot = resolve(import.meta.dirname, "..") } = {}) {
  const records = readDomainManifest(repositoryRoot);
  return structuredClone(canonicalRuntimeEvidence(records, repositoryRoot));
}

function readDomainManifest(repositoryRoot) {
  const manifestPath = resolve(repositoryRoot, "shared/workbench-maturity-capabilities.ts");
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [manifestPath] });
  try {
    const source = sourceFile(snapshot, manifestPath);
    const capabilities = maturityRecords(source);
    const domainsById = new Map(domainRecords(source).map((record) => [record.id, record]));
    const roots = operationRootRecords(source);
    const sideEffects = sourceSideEffectRecords(source);
    assert.equal(new Set(roots.map((root) => operationOwnerKey(root.capabilityId, `${root.path}#${root.symbol}`))).size, roots.length, "frontend operation roots must be unique");
    assert.deepEqual(
      [...new Set(roots.map((root) => root.capabilityId))].sort(),
      capabilities.map((capability) => capability.id).sort(),
      "every maturity capability must declare a frontend operation root",
    );
    return capabilities.map((capability) => ({
      ...capability,
      ...domainsById.get(capability.id),
      operationRoots: roots.filter((root) => root.capabilityId === capability.id),
      sourceSideEffects: sideEffects.filter((binding) => binding.capabilityId === capability.id),
    }));
  } finally {
    snapshot.dispose();
    api.close();
  }
}

function canonicalRuntimeEvidence(records, repositoryRoot) {
  const recordIds = new Set(records.map((record) => record.id));
  const strategyBindings = new Map();
  for (const binding of readMutationStrategyBindings(repositoryRoot)) {
    if (!recordIds.has(binding.capabilityId)) continue;
    const key = operationOwnerKey(binding.capabilityId, binding.operation);
    assert.ok(!strategyBindings.has(key), `duplicate mutation strategy binding ${binding.capabilityId} ${binding.operation}`);
    strategyBindings.set(key, binding);
  }
  const sourceSideEffects = new Map();
  for (const binding of readSourceSideEffectBindings(repositoryRoot)) {
    if (!recordIds.has(binding.capabilityId)) continue;
    const key = operationOwnerKey(binding.capabilityId, binding.operation);
    assert.ok(!sourceSideEffects.has(key), `duplicate source side-effect binding ${binding.capabilityId} ${binding.operation}`);
    sourceSideEffects.set(key, binding);
  }
  const visibleMutations = new Map(records.map((record) => [record.id, deriveVisibleMutations(record, repositoryRoot)]));
  const apiPaths = [...new Set([
    ...records.flatMap((record) => record.apiPaths),
    ...[...visibleMutations.values()].flatMap((operations) => operations.map((operation) => operationParts(operation).apiPath)),
  ])];
  const apis = deriveRouteEvidence(apiPaths, repositoryRoot);
  const mutations = {};
  const consumedStrategyBindings = new Set();
  const consumedSideEffects = new Set();
  for (const record of records) {
    const declarations = mutationDeclarations(record);
    const operations = visibleMutations.get(record.id) ?? [];
    assert.deepEqual(
      [...declarations.keys()].sort(),
      operations,
      `${record.id}: mutation declarations must map one-to-one to generated facts`,
    );
    mutations[record.id] = {};
    for (const operation of operations) {
      const parts = operationParts(operation);
      const route = apis[parts.apiPath];
      assert.ok(route?.methods.includes(parts.method), `${record.id}: generated operation lacks matching route handler ${operation}`);
      const declaration = declarations.get(operation);
      assert.ok(declaration, `${record.id}: generated operation lacks manifest declaration ${operation}`);
      const ownerKey = operationOwnerKey(record.id, operation);
      const proven = strategyBindings.get(ownerKey);
      const sideEffect = sourceSideEffects.get(ownerKey);
      if (sideEffect) {
        assert.equal(sideEffect.apiPath, parts.apiPath, `${record.id}: source side-effect API path contradicts operation ${operation}`);
        assert.equal(declaration.status, "gap", `${record.id}: source side-effect declaration must remain a gap ${operation}`);
      }
      if (declaration.status === "proven") {
        assert.ok(proven, `${record.id}: proven mutation declaration requires structured strategy binding ${operation}`);
        assert.equal(sideEffect, undefined, `${record.id}: proven frontend mutation must not use a side-effect binding ${operation}`);
      } else {
        assert.equal(proven, undefined, `${record.id}: structured strategy binding requires a proven mutation declaration ${operation}`);
      }
      if (proven) consumedStrategyBindings.add(ownerKey);
      if (sideEffect) consumedSideEffects.add(ownerKey);
      mutations[record.id][operation] = {
        id: operation,
        apiPath: parts.apiPath,
        description: operation,
        strategy: proven?.strategy ?? "gap",
        ...(proven ? { safety: proven.source, tests: proven.tests } : {}),
        ...(sideEffect ? { source: sideEffect.source, tests: sideEffect.tests } : {}),
      };
    }
  }
  for (const [key, binding] of strategyBindings) {
    assert.ok(consumedStrategyBindings.has(key), `structured strategy binding has no generated fact ${binding.capabilityId} ${binding.operation}`);
  }
  for (const [key, binding] of sourceSideEffects) {
    assert.ok(consumedSideEffects.has(key), `structured source side-effect binding has no generated fact ${binding.capabilityId} ${binding.operation}`);
  }
  return { apis, owners: OWNER_EVIDENCE, mutations };
}

function deriveRouteEvidence(apiPaths, repositoryRoot) {
  const cacheKey = `${repositoryRoot}\0${[...apiPaths].sort().join("\0")}`;
  const cached = ROUTE_EVIDENCE_CACHE.get(cacheKey);
  if (cached) return cached;
  const routeRoot = resolve(repositoryRoot, "src/routes");
  const paths = sourcePaths(routeRoot);
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: paths });
  try {
    const definitions = [];
    for (const absolutePath of paths) {
      const source = sourceFile(snapshot, absolutePath);
      const ifStatements = [];
      const regexRoutes = [];
      const functionBodies = new Map();
      const visit = (node) => {
        if (isIfStatement(node)) ifStatements.push(node);
        if (isFunctionDeclaration(node) && node.name && node.body) functionBodies.set(node.name.getText(source), node.body.getText(source));
        if (isVariableDeclaration(node) && isIdentifier(node.name) && node.initializer) {
          const text = node.initializer.getText(source);
          const match = text.match(/^(\/\^.*\/[a-z]*)\.exec\(url\.pathname\)$/u);
          if (match) regexRoutes.push({ name: node.name.text, literal: match[1], node });
        }
        node.forEachChild(visit);
      };
      visit(source);
      for (const statement of ifStatements) {
        const expression = statement.expression.getText(source);
        const staticMatch = expression.match(/url\.pathname\s*(!==|===)\s*["'](\/api\/[^"']+)["']/u);
        if (staticMatch) {
          const functionNode = enclosingFunction(statement);
          const body = staticMatch[1] === "!==" ? continuationAfterGuard(statement, source) : statement.thenStatement.getText(source);
          if (body && functionNode) definitions.push(routeDefinition(staticMatch[2], null, expandLocalCalls(body, functionBodies), relative(repositoryRoot, absolutePath), functionNode.name?.getText(source) ?? "anonymous"));
        }
      }
      for (const route of regexRoutes) {
        const statement = ifStatements.find((candidate) => [route.name, `!${route.name}`].includes(candidate.expression.getText(source)));
        const functionNode = statement ? enclosingFunction(statement) : null;
        if (statement && functionNode) {
          const body = statement.expression.getText(source) === `!${route.name}` ? continuationAfterGuard(statement, source) : statement.thenStatement.getText(source);
          definitions.push(routeDefinition(null, route.literal, expandLocalCalls(body, functionBodies), relative(repositoryRoot, absolutePath), functionNode.name?.getText(source) ?? "anonymous"));
        }
      }
    }
    const evidence = Object.fromEntries(apiPaths.map((path) => {
      const sample = path.replace(/:[A-Za-z][A-Za-z0-9_]*/gu, "probe-id");
      const staticMatches = definitions.filter((definition) => definition.path === path);
      const rawMatches = staticMatches.length > 0 ? staticMatches : definitions.filter((definition) => definition.regex && definition.regex.test(sample));
      const matches = [...new Map(rawMatches.map((definition) => [`${definition.sourcePath}#${definition.symbol}#${definition.path ?? definition.regex.source}`, definition])).values()];
      assert.equal(matches.length, 1, `unknown API evidence ${path}: expected exactly one source-owned route definition, found ${matches.length}`);
      return [path, { ...matches[0], path }];
    }));
    ROUTE_EVIDENCE_CACHE.set(cacheKey, evidence);
    return evidence;
  } finally {
    snapshot.dispose();
    api.close();
  }
}

function expandLocalCalls(body, functionBodies) {
  let expanded = body;
  for (const [name, functionBody] of functionBodies) if (new RegExp(`\\b${name}\\s*\\(`, "u").test(body)) expanded += `\n${functionBody}`;
  return expanded;
}

function continuationAfterGuard(statement, source) {
  const statements = statement.parent?.statements;
  assert.ok(statements, `route guard must be a direct block statement: ${statement.getText(source)}`);
  const index = statements.indexOf(statement);
  assert.ok(index >= 0, "route guard must belong to its parent block");
  const continuation = statements.slice(index + 1).map((node) => node.getText(source)).join("\n");
  assert.ok(continuation.length > 0, `route guard has no owned continuation: ${statement.getText(source)}`);
  return continuation;
}

function routeDefinition(path, literal, body, sourcePath, symbol) {
  const methods = [...new Set([...body.matchAll(/request\.method\s*(?:===|!==)\s*["'](GET|POST|PUT|PATCH|DELETE)["']/gu)].map((match) => match[1]))].sort();
  const pagination = body.includes("parseNumberedPageRequest")
    ? "numbered"
    : /\b(?:parsePageRequest|cursorPage|pageRequest)\s*\(/u.test(body)
      ? "cursor"
      : "not_applicable";
  return { path, regex: literal ? regularExpression(literal) : null, sourcePath, symbol, methods, pagination };
}

function regularExpression(literal) {
  const lastSlash = literal.lastIndexOf("/");
  return new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1));
}

function enclosingFunction(node) {
  for (let current = node.parent; current; current = current.parent) if (isFunctionDeclaration(current)) return current;
  return null;
}

function deriveVisibleMutations(record, repositoryRoot) {
  const index = frontendSourceIndex(repositoryRoot);
  assert.ok(Array.isArray(record.operationRoots) && record.operationRoots.length > 0, `${record.id}: frontend operation root is required`);
  const queue = record.operationRoots.map((root) => ({ ...root, required: true }));
  const visited = new Set();
  const operations = new Set();
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) continue;
    const visitKey = `${item.path}#${item.symbol ?? "module"}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    const entry = index.get(item.path);
    if (!entry) {
      assert.equal(item.required, false, `${record.id}: missing frontend operation root module ${item.path}`);
      continue;
    }
    const scope = item.symbol === "*" ? entry.module : entry.functions.get(item.symbol);
    if (!scope) {
      assert.equal(item.required, false, `${record.id}: missing frontend operation root ${item.path}#${item.symbol}`);
      continue;
    }
    assert.equal(scope.unsupportedMutations.length, 0, `${record.id}: unsupported frontend mutation invocation: ${scope.unsupportedMutations.join(", ")}`);
    for (const invoked of scope.invokedImports) {
      if (entry.functions.has(invoked)) {
        queue.push({ path: item.path, symbol: invoked, required: false });
        continue;
      }
      const imported = entry.imports.get(invoked);
      if (imported) queue.push({ ...imported, required: false });
    }
    for (const call of scope.calls) {
      const declaredPath = record.apiPaths.find((pathValue) => pathShape(pathValue) === pathShape(call.path));
      if (call.method !== "GET") operations.add(`${call.method} ${declaredPath ?? call.path}`);
    }
  }
  for (const binding of record.sourceSideEffects ?? []) {
    if (binding.capabilityId === record.id) operations.add(binding.operation);
  }
  return [...operations].sort();
}

function frontendSourceIndex(repositoryRoot) {
  const cached = FRONTEND_INDEX_CACHE.get(repositoryRoot);
  if (cached) return cached;
  const frontendRoot = resolve(repositoryRoot, "frontend");
  const paths = sourcePaths(frontendRoot);
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: paths });
  try {
    const index = new Map();
    for (const absolutePath of paths) {
      const source = sourceFile(snapshot, absolutePath);
      const imports = new Map();
      const functions = new Map();
      const visit = (node) => {
        if (isImportDeclaration(node) && isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith(".")) {
          const imported = resolveSourceImport(absolutePath, node.moduleSpecifier.text);
          const named = node.getText(source).match(/import\s*\{([^}]+)\}/u)?.[1];
          if (imported && named) {
            for (const part of named.split(",")) {
              const cleaned = part.trim().replace(/^type\s+/u, "");
              const [importedName, localName = importedName] = cleaned.split(/\s+as\s+/u);
              if (importedName) imports.set(localName, { path: relative(repositoryRoot, imported), symbol: importedName });
            }
          }
        }
        if (isFunctionDeclaration(node) && node.name && node.body) functions.set(node.name.getText(source), frontendScope(node.body, source));
        node.forEachChild(visit);
      };
      visit(source);
      index.set(relative(repositoryRoot, absolutePath), { imports, functions, module: frontendScope(source, source) });
    }
    FRONTEND_INDEX_CACHE.set(repositoryRoot, index);
    return index;
  } finally {
    snapshot.dispose();
    api.close();
  }
}

function frontendScope(node, source) {
  const calls = [];
  const unsupportedMutations = [];
  const invokedImports = new Set();
  const scopeText = node.getText(source);
  for (const match of scopeText.matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/gu)) invokedImports.add(match[1]);
  const visit = (child) => {
    if (isCallExpression(child)) {
      const expression = child.expression.getText(source);
      if (expression === "apiFetch") {
        const options = child.arguments[1];
        const method = frontendCallMethod(options);
        const argument = child.arguments[0]?.getText(source);
        if (method === null) {
          unsupportedMutations.push(options?.getText(source) ?? "<missing options>");
          return;
        }
        const paths = frontendCallPaths(argument, scopeText);
        for (const path of paths) calls.push({ path, method });
        if (method !== "GET" && paths.length === 0) unsupportedMutations.push(argument ?? "<missing>");
      } else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(expression)) {
        invokedImports.add(expression);
      }
    }
    child.forEachChild(visit);
  };
  visit(node);
  return { calls, invokedImports, unsupportedMutations };
}

function frontendCallMethod(options) {
  if (!options) return "GET";
  const expression = unwrapExpression(options);
  if (!isObjectLiteralExpression(expression)) return null;
  let method = "GET";
  for (const property of expression.properties) {
    if (isSpreadAssignment(property)) return null;
    if (isShorthandPropertyAssignment(property)) {
      if (property.name.text === "method") return null;
      continue;
    }
    if (!isPropertyAssignment(property) || (!isIdentifier(property.name) && !isStringLiteral(property.name))) return null;
    if (property.name.text !== "method") continue;
    const value = unwrapExpression(property.initializer);
    if (!isStringLiteral(value) || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value.text)) return null;
    method = value.text;
  }
  return method;
}

function frontendCallPaths(text, scopeText) {
  if (!text || (!text.startsWith("\"") && !text.startsWith("'") && !text.startsWith("`"))) return [];
  let candidates = [text.slice(1, -1)];
  for (const match of [...candidates[0].matchAll(/\$\{([A-Za-z_$][A-Za-z0-9_$]*)\}/gu)]) {
    const values = scopeText.match(new RegExp(`(?:const|let)\\s+${match[1]}\\s*=.*?[?].*?["']([^"']+)["']\\s*:\\s*["']([^"']+)["']`, "u"))?.slice(1);
    if (values) candidates = candidates.flatMap((candidate) => values.map((value) => candidate.replace(match[0], value)));
  }
  return candidates
    .map((candidate) => candidate.replace(/\$\{[^}]+\}/gu, ":id").split("?")[0])
    .filter((path) => path.startsWith("/api/"));
}

function pathShape(path) {
  return path.replace(/:[A-Za-z][A-Za-z0-9_]*/gu, ":*");
}

function sourcePaths(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name)))
    .map((entry) => resolve(entry.parentPath, entry.name));
}

function resolveSourceImport(importer, specifier) {
  const base = resolve(dirname(importer), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts"), resolve(base, "index.tsx")]) if (existsSync(candidate)) return candidate;
  return null;
}

export async function loadWorkbenchDomainAudit({ repositoryRoot = resolve(import.meta.dirname, "..") } = {}) {
  const manifestPath = resolve(repositoryRoot, "shared/workbench-maturity-capabilities.ts");
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [manifestPath] });
  try {
    const source = sourceFile(snapshot, manifestPath);
    const capabilities = maturityRecords(source);
    const domains = domainRecords(source);
    const roots = operationRootRecords(source);
    const sideEffects = sourceSideEffectRecords(source);
    assert.equal(new Set(roots.map((root) => operationOwnerKey(root.capabilityId, `${root.path}#${root.symbol}`))).size, roots.length, "frontend operation roots must be unique");
    assert.equal(new Set(domains.map((record) => record.id)).size, domains.length, "domain capability ids must be unique");
    assert.deepEqual(
      domains.map((record) => record.id).sort(),
      capabilities.map((record) => record.id).sort(),
      "domain evidence must map one-to-one to maturity capabilities",
    );
    assert.deepEqual(
      [...new Set(roots.map((root) => root.capabilityId))].sort(),
      capabilities.map((record) => record.id).sort(),
      "every maturity capability must declare a frontend operation root",
    );
    const domainsById = new Map(domains.map((record) => [record.id, record]));
    const joined = capabilities.map((capability, routeOrder) => ({
      ...capability,
      ...domainsById.get(capability.id),
      operationRoots: roots.filter((root) => root.capabilityId === capability.id),
      sourceSideEffects: sideEffects.filter((binding) => binding.capabilityId === capability.id),
      routeOrder,
    }));
    for (const record of joined) record.mutationFactIds = deriveVisibleMutations(record, repositoryRoot);
    validateWorkbenchDomainAudit(joined, { repositoryRoot });
    return joined;
  } finally {
    snapshot.dispose();
    api.close();
  }
}

export function validateWorkbenchDomainAudit(records, { repositoryRoot = resolve(import.meta.dirname, ".."), runtimeEvidence = runtimeEvidenceSnapshot() } = {}) {
  const canonical = canonicalRuntimeEvidence(records, repositoryRoot);
  const semanticBindings = [];
  const testBindings = [];
  for (const record of records) {
    record.apiEvidence = canonical.apis;
    record.mutationEvidence = canonical.mutations[record.id];
    assert.ok(typeof record.id === "string" && record.id.length > 0, "domain capability id is required");
    assert.ok(Array.isArray(record.apiPaths), `${record.id}: apiPaths must be an array`);
    assert.ok(record.apiPaths.every((path) => /^\/api\/[A-Za-z0-9_/:.-]+$/u.test(path)), `${record.id}: API paths must be normalized /api paths`);
    assert.ok(Array.isArray(record.persistencePaths), `${record.id}: persistencePaths must be an array`);
    assert.ok(Array.isArray(record.mutations), `${record.id}: mutations must be an array`);
    assert.ok(Array.isArray(record.mutationFactIds), `${record.id}: mutation fact inventory is required`);

    for (const apiPath of record.apiPaths) {
      const fact = canonical.apis[apiPath];
      assert.ok(fact, `${record.id}: unknown API evidence ${apiPath}`);
      if (runtimeEvidence) assert.deepEqual(runtimeEvidence.apis?.[apiPath], fact, `${record.id}: runtime evidence contradiction for ${apiPath}`);
    }

    if (record.ownerPredicate !== null) {
      assert.ok(typeof record.ownerPredicate === "string" && record.ownerPredicate.length > 0, `${record.id}: ownerPredicate must be null or text`);
      const fact = canonical.owners[record.ownerPredicate];
      assert.ok(fact && fact.predicate === record.ownerPredicate, `${record.id}: owner evidence contradiction`);
      if (runtimeEvidence) assert.deepEqual(runtimeEvidence.owners?.[record.ownerPredicate], fact, `${record.id}: runtime evidence contradiction for owner`);
      semanticBindings.push(...fact.bindings.map((bindingValue) => ({ binding: bindingValue, context: `${record.id}: owner evidence` })));
    }

    const expectedMutations = deriveVisibleMutations(record, repositoryRoot);
    assert.deepEqual(record.mutationFactIds, expectedMutations, `${record.id}: visible mutation inventory contradiction`);
    for (const mutationFactId of expectedMutations) {
      const fact = canonical.mutations[record.id]?.[mutationFactId];
      assert.ok(fact, `${record.id}: unknown mutation evidence ${mutationFactId}`);
      assert.ok(record.apiPaths.some((apiPath) => pathShape(apiPath) === pathShape(fact.apiPath)), `${record.id}: source-visible API ownership contradiction for ${mutationFactId}`);
      assert.ok(["gap", "idempotency_key", "conditional_write"].includes(fact.strategy), `${record.id}: mutation strategy evidence contradiction for ${mutationFactId}`);
      if (runtimeEvidence) assert.deepEqual(runtimeEvidence.mutations?.[record.id]?.[mutationFactId], fact, `${record.id}: runtime evidence contradiction for mutation ${mutationFactId}`);
      if (fact.strategy !== "gap") {
        semanticBindings.push({ binding: fact.safety, context: `${record.id}: mutation strategy evidence ${mutationFactId}` });
        testBindings.push(...fact.tests.map((bindingValue) => ({ binding: bindingValue, context: `${record.id}: mutation regression evidence ${mutationFactId}` })));
      } else if (fact.source) {
        semanticBindings.push({ binding: fact.source, context: `${record.id}: source side-effect evidence ${mutationFactId}` });
        testBindings.push(...fact.tests.map((bindingValue) => ({ binding: bindingValue, context: `${record.id}: source side-effect regression ${mutationFactId}` })));
      }
    }

    const evidencePaths = [
      ...(record.frontendEvidence ?? []),
      ...(record.backendEvidence ?? []),
      ...(record.testEvidence ?? []),
      ...record.persistencePaths,
    ];
    for (const path of evidencePaths) {
      assert.ok(typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.split("/").includes(".."), `${record.id}: invalid evidence path ${String(path)}`);
      assert.equal(existsSync(resolve(repositoryRoot, path)), true, `${record.id}: missing evidence path ${path}`);
    }

    if (record.dimensions?.api === "proven") {
      assert.ok(record.apiPaths.length > 0, `${record.id}: proven api dimension requires an API path`);
    }
    if (record.dimensions?.persistence === "proven") {
      assert.ok(record.persistencePaths.length > 0, `${record.id}: proven persistence dimension requires runtime persistence evidence`);
      assert.ok(record.persistencePaths.some((path) => path.startsWith("src/")), `${record.id}: a migration alone cannot prove persistence`);
    }
    if (record.dimensions?.isolation === "proven") {
      assert.ok(record.ownerPredicate !== null, `${record.id}: proven isolation dimension requires a runtime owner predicate`);
    }
    if (record.dimensions?.query_or_idempotency === "proven") {
      assert.ok(record.apiPaths.length > 0 || record.mutationFactIds.length > 0, `${record.id}: proven query or idempotency dimension lacks evidence`);
    }
  }
  verifySymbolBindings(semanticBindings, repositoryRoot);
  verifyTestBindings(testBindings, repositoryRoot);
  return records;
}

function readMutationStrategyBindings(repositoryRoot) {
  const manifestPath = resolve(repositoryRoot, "shared/workbench-maturity-capabilities.ts");
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [manifestPath] });
  try {
    return mutationStrategyRecords(sourceFile(snapshot, manifestPath));
  } finally {
    snapshot.dispose();
    api.close();
  }
}

function readSourceSideEffectBindings(repositoryRoot) {
  const manifestPath = resolve(repositoryRoot, "shared/workbench-maturity-capabilities.ts");
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [manifestPath] });
  try {
    return sourceSideEffectRecords(sourceFile(snapshot, manifestPath));
  } finally {
    snapshot.dispose();
    api.close();
  }
}

function operationOwnerKey(capabilityId, operation) {
  return `${capabilityId}\0${operation}`;
}

function operationParts(operation) {
  const match = /^(GET|POST|PUT|PATCH|DELETE) (\/api\/[A-Za-z0-9_/:.-]+)(?:#[a-z0-9-]+)?$/u.exec(operation);
  assert.ok(match, `invalid operation identity ${operation}`);
  return { method: match[1], apiPath: match[2] };
}

function mutationDeclarations(record) {
  const declarations = new Map();
  for (const declaration of record.mutations) {
    const match = /^(GET|POST|PUT|PATCH|DELETE) (\/api\/[A-Za-z0-9_/:.-]+(?:#[a-z0-9-]+)?) — (proven|gap): (.+)$/u.exec(declaration);
    assert.ok(match, `${record.id}: mutation declaration must carry one exact operation identity: ${declaration}`);
    const operation = `${match[1]} ${match[2]}`;
    assert.ok(!declarations.has(operation), `${record.id}: duplicate mutation declaration ${operation}`);
    declarations.set(operation, { operation, status: match[3], detail: match[4] });
  }
  return declarations;
}

function verifySymbolBindings(entries, repositoryRoot) {
  const paths = [...new Set(entries.map(({ binding: bindingValue }) => resolve(repositoryRoot, bindingValue.path)))];
  if (paths.length === 0) return;
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: paths });
  try {
    const symbols = new Map();
    for (const absolutePath of paths) {
      const source = sourceFile(snapshot, absolutePath);
      const visit = (node) => {
        if (isFunctionDeclaration(node) && node.name && node.body) {
          symbols.set(`${relative(repositoryRoot, absolutePath)}#${node.name.getText(source)}`, node.body.getText(source));
        }
        if (isMethodDeclaration(node) && node.name && node.body && isClassDeclaration(node.parent) && node.parent.name) {
          symbols.set(`${relative(repositoryRoot, absolutePath)}#${node.parent.name.getText(source)}.${node.name.getText(source)}`, node.body.getText(source));
        }
        node.forEachChild(visit);
      };
      visit(source);
    }
    for (const { binding: bindingValue, context } of entries) {
      assert.ok(bindingValue && typeof bindingValue.path === "string" && typeof bindingValue.symbol === "string" && Array.isArray(bindingValue.tokens), `${context}: invalid semantic binding`);
      const body = symbols.get(`${bindingValue.path}#${bindingValue.symbol}`);
      assert.ok(body, `${context}: missing bound symbol ${bindingValue.path}#${bindingValue.symbol}`);
      assert.ok(bindingValue.tokens.length > 0, `${context}: semantic binding requires tokens`);
      for (const token of bindingValue.tokens) assert.ok(body.includes(token), `${context}: token ${JSON.stringify(token)} is outside bound symbol ${bindingValue.symbol}`);
    }
  } finally {
    snapshot.dispose();
    api.close();
  }
}

function verifyTestBindings(entries, repositoryRoot) {
  for (const { binding: bindingValue, context } of entries) {
    assert.ok(bindingValue && typeof bindingValue.path === "string" && Array.isArray(bindingValue.tokens), `${context}: invalid test binding`);
    const path = resolve(repositoryRoot, bindingValue.path);
    assert.equal(existsSync(path), true, `${context}: missing test evidence ${bindingValue.path}`);
    const source = readFileSync(path, "utf8");
    assert.ok(bindingValue.tokens.length > 0, `${context}: test binding requires tokens`);
    for (const token of bindingValue.tokens) assert.ok(source.includes(token), `${context}: token ${JSON.stringify(token)} is outside test ${bindingValue.path}`);
  }
}

export function renderWorkbenchDomainAudit(records) {
  const sorted = [...records].sort((left, right) => left.routeOrder - right.routeOrder || left.id.localeCompare(right.id));
  const rows = sorted.map((record) => [
    record.id,
    record.pathname,
    listCell(record.apiPaths.map((path) => `${path} (${record.apiEvidence[path].pagination})`)),
    listCell(record.persistencePaths),
    record.ownerPredicate ?? "—",
    mutationCell(record),
    listCell(record.testEvidence),
    record.classification,
    listCell(record.gaps),
  ].map(markdownCell).join(" | "));
  return [
    "# Workbench R0 Domain Audit",
    "",
    "Generated deterministically by `scripts/workbench-domain-audit.mjs`. Every capability declares explicit frontend operation roots; every manifest operation declaration and capability-owned strategy binding maps bidirectionally to one generated fact. Ordinary GET calls remain excluded unless an independently source- and test-bound side effect declares a stable operation identity. Every API carries its independently bound runtime pagination shape, and mutation status remains conservative.",
    "",
    "| Capability | Route | API and pagination | Persistence | Owner predicate | Mutation safety | Test evidence | Classification | Gaps |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
    "",
  ].join("\n");
}

function mutationCell(record) {
  if (record.mutationFactIds.length === 0) return "not_applicable";
  return record.mutationFactIds.map((id) => {
    const fact = record.mutationEvidence[id];
    return `${fact.description} — ${fact.strategy === "gap" ? "gap" : `proven ${fact.strategy}`}`;
  }).join("; ");
}

function listCell(values) {
  return values.length === 0 ? "—" : values.join("<br>");
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function sourceFile(snapshot, path) {
  const project = snapshot.getDefaultProjectForFile(path);
  const source = project?.program.getSourceFile(path);
  assert.ok(source, `${path} is required`);
  const diagnostics = project.program.getSyntacticDiagnostics(path);
  assert.equal(diagnostics.length, 0, `${path} must parse without syntactic diagnostics`);
  return source;
}

function maturityRecords(source) {
  return arrayRecords(source, "WORKBENCH_MATURITY_CAPABILITIES").map((entry, index) => {
    const context = `maturity record ${index}`;
    const properties = objectProperties(entry, context);
    return {
      id: requiredString(properties, "id", context),
      pathname: requiredString(properties, "pathname", context),
      classification: requiredString(properties, "classification", context),
      dimensions: stringRecord(source, properties.get("dimensions"), `${context} dimensions`),
      frontendEvidence: stringArray(source, properties.get("frontendEvidence"), `${context} frontendEvidence`),
      backendEvidence: stringArray(source, properties.get("backendEvidence"), `${context} backendEvidence`),
      testEvidence: stringArray(source, properties.get("testEvidence"), `${context} testEvidence`),
      gaps: stringArray(source, properties.get("gaps"), `${context} gaps`),
    };
  });
}

function domainRecords(source) {
  return arrayRecords(source, "WORKBENCH_MATURITY_DOMAIN_EVIDENCE").map((entry, index) => {
    const context = `domain record ${index}`;
    const properties = objectProperties(entry, context);
    assert.deepEqual(new Set(properties.keys()), DOMAIN_KEYS, `${context} must use the exact domain fields`);
    return {
      id: requiredString(properties, "id", context),
      apiPaths: stringArray(source, properties.get("apiPaths"), `${context} apiPaths`),
      persistencePaths: stringArray(source, properties.get("persistencePaths"), `${context} persistencePaths`),
      ownerPredicate: nullableString(properties, "ownerPredicate", context),
      pagination: requiredString(properties, "pagination", context),
      mutations: stringArray(source, properties.get("mutations"), `${context} mutations`),
      mutationSafety: requiredString(properties, "mutationSafety", context),
    };
  });
}

function mutationStrategyRecords(source) {
  return arrayRecords(source, "WORKBENCH_MUTATION_STRATEGY_BINDINGS").map((entry, index) => {
    const context = `mutation strategy binding ${index}`;
    const properties = objectProperties(entry, context);
    assert.deepEqual(new Set(properties.keys()), new Set(["capabilityId", "operation", "strategy", "source", "tests"]), `${context} must use the exact strategy fields`);
    const tests = unwrapExpression(properties.get("tests"));
    assert.ok(isArrayLiteralExpression(tests), `${context} tests must be an array literal`);
    return {
      capabilityId: requiredString(properties, "capabilityId", context),
      operation: requiredString(properties, "operation", context),
      strategy: requiredString(properties, "strategy", context),
      source: semanticBindingRecord(source, properties.get("source"), `${context} source`),
      tests: tests.elements.map((entryValue, testIndex) => testBindingRecord(source, entryValue, `${context} test ${testIndex}`)),
    };
  });
}

function operationRootRecords(source) {
  return arrayRecords(source, "WORKBENCH_OPERATION_ROOTS").map((entry, index) => {
    const context = `frontend operation root ${index}`;
    const properties = objectProperties(entry, context);
    assert.deepEqual(new Set(properties.keys()), new Set(["capabilityId", "path", "symbol"]), `${context} must use the exact root fields`);
    return {
      capabilityId: requiredString(properties, "capabilityId", context),
      path: requiredString(properties, "path", context),
      symbol: requiredString(properties, "symbol", context),
    };
  });
}

function sourceSideEffectRecords(source) {
  return arrayRecords(source, "WORKBENCH_SOURCE_SIDE_EFFECT_BINDINGS").map((entry, index) => {
    const context = `source side-effect binding ${index}`;
    const properties = objectProperties(entry, context);
    assert.deepEqual(new Set(properties.keys()), new Set(["capabilityId", "operation", "apiPath", "source", "tests"]), `${context} must use the exact side-effect fields`);
    const tests = unwrapExpression(properties.get("tests"));
    assert.ok(isArrayLiteralExpression(tests), `${context} tests must be an array literal`);
    return {
      capabilityId: requiredString(properties, "capabilityId", context),
      operation: requiredString(properties, "operation", context),
      apiPath: requiredString(properties, "apiPath", context),
      source: semanticBindingRecord(source, properties.get("source"), `${context} source`),
      tests: tests.elements.map((entryValue, testIndex) => testBindingRecord(source, entryValue, `${context} test ${testIndex}`)),
    };
  });
}

function semanticBindingRecord(source, node, context) {
  const properties = objectProperties(unwrapExpression(node), context);
  assert.deepEqual(new Set(properties.keys()), new Set(["path", "symbol", "tokens"]), `${context} must use path, symbol, and tokens`);
  return {
    path: requiredString(properties, "path", context),
    symbol: requiredString(properties, "symbol", context),
    tokens: stringArray(source, properties.get("tokens"), `${context} tokens`),
  };
}

function testBindingRecord(source, node, context) {
  const properties = objectProperties(unwrapExpression(node), context);
  assert.deepEqual(new Set(properties.keys()), new Set(["path", "tokens"]), `${context} must use path and tokens`);
  return {
    path: requiredString(properties, "path", context),
    tokens: stringArray(source, properties.get("tokens"), `${context} tokens`),
  };
}

function arrayRecords(source, declarationName) {
  const declaration = variableDeclaration(source, declarationName);
  const initializer = unwrapExpression(declaration.initializer);
  assert.ok(isCallExpression(initializer), `${declarationName} must use Object.freeze`);
  assert.equal(initializer.expression.getText(source), "Object.freeze", `${declarationName} must use Object.freeze`);
  assert.equal(initializer.arguments.length, 1, `${declarationName} must freeze one array`);
  const array = unwrapExpression(initializer.arguments[0]);
  assert.ok(isArrayLiteralExpression(array), `${declarationName} must freeze an array`);
  return array.elements;
}

function variableDeclaration(source, name) {
  const declarations = [];
  const visit = (node) => {
    if (isVariableDeclaration(node) && isIdentifier(node.name) && node.name.text === name) declarations.push(node);
    node.forEachChild(visit);
  };
  visit(source);
  assert.equal(declarations.length, 1, `${name} declaration is required exactly once`);
  assert.ok(declarations[0].initializer, `${name} initializer is required`);
  return declarations[0];
}

function objectProperties(node, context) {
  assert.ok(isObjectLiteralExpression(node), `${context} must be an object literal`);
  const properties = new Map();
  for (const property of node.properties) {
    assert.ok(isPropertyAssignment(property), `${context} must use property assignments`);
    assert.ok(property.name && (isIdentifier(property.name) || isStringLiteral(property.name)), `${context} property name is invalid`);
    assert.ok(!properties.has(property.name.text), `${context} has duplicate ${property.name.text}`);
    properties.set(property.name.text, property.initializer);
  }
  return properties;
}

function requiredString(properties, name, context) {
  const value = properties.get(name);
  assert.ok(isStringLiteral(value), `${context} ${name} must be a string literal`);
  return value.text;
}

function nullableString(properties, name, context) {
  const value = properties.get(name);
  if (value?.getText() === "null") return null;
  return requiredString(properties, name, context);
}

function stringArray(source, node, context) {
  const array = staticExpression(source, node, context);
  assert.ok(isArrayLiteralExpression(array), `${context} must be an array literal`);
  return array.elements.map((element, index) => {
    assert.ok(isStringLiteral(element), `${context} ${index} must be a string literal`);
    return element.text;
  });
}

function stringRecord(source, node, context) {
  const properties = objectProperties(staticExpression(source, node, context), context);
  return Object.fromEntries([...properties].map(([key, value]) => [key, requiredString(new Map([[key, value]]), key, context)]));
}

function staticExpression(source, expression, context) {
  expression = unwrapExpression(expression);
  if (isIdentifier(expression)) {
    const declaration = variableDeclaration(source, expression.text);
    assert.ok(declaration.initializer, `${context} ${expression.text} initializer is required`);
    expression = unwrapExpression(declaration.initializer);
  }
  assert.ok(!isIdentifier(expression), `${context} must not use an identifier chain`);
  return expression;
}

function unwrapExpression(expression) {
  while (isAsExpression(expression) || isSatisfiesExpression(expression) || isParenthesizedExpression(expression)) {
    expression = expression.expression;
  }
  return expression;
}

async function runCli() {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const [mode, argument, extra] = process.argv.slice(2);
  assert.equal(extra, undefined, "usage: workbench-domain-audit.mjs --check [path] | --write path");
  assert.ok(mode === "--check" || mode === "--write", "usage: workbench-domain-audit.mjs --check [path] | --write path");
  if (mode === "--write") assert.ok(argument, "--write requires an evidence path");
  const outputPath = resolve(repositoryRoot, argument ?? DEFAULT_EVIDENCE_PATH);
  const records = await loadWorkbenchDomainAudit({ repositoryRoot });
  const rendered = renderWorkbenchDomainAudit(records);
  if (mode === "--write") {
    writeFileSync(outputPath, rendered);
    process.stdout.write(`wrote ${outputPath}\n`);
    return;
  }
  assert.equal(existsSync(outputPath), true, `domain audit evidence is missing: ${outputPath}`);
  assert.equal(readFileSync(outputPath, "utf8"), rendered, `domain audit evidence is stale: ${outputPath}`);
  process.stdout.write(`domain audit evidence is current: ${outputPath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
