import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { API } from "typescript/unstable/sync";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isStringLiteral,
  isVariableDeclaration,
} from "typescript/unstable/ast/is";

const DEFAULT_EVIDENCE_PATH = "docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md";
const PAGINATION = new Set(["numbered", "cursor", "not_applicable"]);
const MUTATION_SAFETY = new Set(["idempotency_key", "conditional_write", "convergent_delete", "mixed", "not_applicable"]);
const DOMAIN_KEYS = new Set(["id", "apiPaths", "persistencePaths", "ownerPredicate", "pagination", "mutations", "mutationSafety"]);

export async function loadWorkbenchDomainAudit({ repositoryRoot = resolve(import.meta.dirname, "..") } = {}) {
  const manifestPath = resolve(repositoryRoot, "shared/workbench-maturity-capabilities.ts");
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [manifestPath] });
  try {
    const source = sourceFile(snapshot, manifestPath);
    const capabilities = maturityRecords(source);
    const domains = domainRecords(source);
    assert.equal(new Set(domains.map((record) => record.id)).size, domains.length, "domain capability ids must be unique");
    assert.deepEqual(
      domains.map((record) => record.id).sort(),
      capabilities.map((record) => record.id).sort(),
      "domain evidence must map one-to-one to maturity capabilities",
    );
    const domainsById = new Map(domains.map((record) => [record.id, record]));
    const joined = capabilities.map((capability, routeOrder) => ({
      ...capability,
      ...domainsById.get(capability.id),
      routeOrder,
    }));
    validateWorkbenchDomainAudit(joined, { repositoryRoot });
    return joined;
  } finally {
    snapshot.dispose();
    api.close();
  }
}

export function validateWorkbenchDomainAudit(records, { repositoryRoot = resolve(import.meta.dirname, "..") } = {}) {
  for (const record of records) {
    assert.ok(typeof record.id === "string" && record.id.length > 0, "domain capability id is required");
    assert.ok(Array.isArray(record.apiPaths), `${record.id}: apiPaths must be an array`);
    assert.ok(record.apiPaths.every((path) => /^\/api\/[A-Za-z0-9_/:.-]+$/u.test(path)), `${record.id}: API paths must be normalized /api paths`);
    assert.ok(Array.isArray(record.persistencePaths), `${record.id}: persistencePaths must be an array`);
    assert.ok(PAGINATION.has(record.pagination), `${record.id}: unsupported pagination mode`);
    assert.ok(Array.isArray(record.mutations), `${record.id}: mutations must be an array`);
    assert.ok(MUTATION_SAFETY.has(record.mutationSafety), `${record.id}: unsupported mutation safety`);

    if (record.mutations.length === 0) {
      assert.equal(record.mutationSafety, "not_applicable", `${record.id}: mutation safety contradicts an empty mutation list`);
    } else {
      assert.notEqual(record.mutationSafety, "not_applicable", `${record.id}: mutation safety is required`);
      assert.ok(
        record.mutations.every((mutation) => typeof mutation === "string" && / — (?:proven|gap):/u.test(mutation)),
        `${record.id}: every mutation must label proven safety or a gap`,
      );
      if (record.mutationSafety !== "mixed") {
        assert.ok(
          record.mutations.every((mutation) => mutation.includes(" — proven:")),
          `${record.id}: claims ${record.mutationSafety} without proven mutation evidence`,
        );
      }
    }

    if (record.ownerPredicate !== null) {
      assert.ok(typeof record.ownerPredicate === "string" && record.ownerPredicate.length > 0, `${record.id}: ownerPredicate must be null or text`);
      assert.match(
        record.ownerPredicate,
        /authenticated (?:member\.memberId|scope\.memberId|actorMemberId)/u,
        `${record.id}: ownerPredicate must cite an authenticated runtime principal`,
      );
      assert.ok(record.backendEvidence?.some((path) => path.startsWith("src/")), `${record.id}: ownerPredicate requires runtime backend evidence`);
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
      assert.ok(record.pagination !== "not_applicable" || record.mutationSafety !== "not_applicable", `${record.id}: proven query or idempotency dimension lacks evidence`);
    }
  }
  return records;
}

export function renderWorkbenchDomainAudit(records) {
  const sorted = [...records].sort((left, right) => left.routeOrder - right.routeOrder || left.id.localeCompare(right.id));
  const rows = sorted.map((record) => [
    record.id,
    record.pathname,
    listCell(record.apiPaths),
    listCell(record.persistencePaths),
    record.ownerPredicate ?? "—",
    record.pagination,
    mutationCell(record),
    listCell(record.testEvidence),
    record.classification,
    listCell(record.gaps),
  ].map(markdownCell).join(" | "));
  return [
    "# Workbench R0 Domain Audit",
    "",
    "Generated deterministically by `scripts/workbench-domain-audit.mjs`. Pagination records the observed primary API shape, not complete UI pagination. `mixed` explicitly includes the per-endpoint gaps shown in the mutation cell and is not a product-maturity claim.",
    "",
    "| Capability | Route | API | Persistence | Owner predicate | Pagination | Mutation safety | Test evidence | Classification | Gaps |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
    "",
  ].join("\n");
}

function mutationCell(record) {
  if (record.mutations.length === 0) return "not_applicable";
  return `${record.mutationSafety}: ${record.mutations.join("; ")}`;
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
