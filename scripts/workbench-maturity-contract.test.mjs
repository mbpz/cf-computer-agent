import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
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

const repositoryRoot = resolve(import.meta.dirname, "..");
const routeCapabilitiesPath = resolve(repositoryRoot, "shared/workspace-route-capabilities.ts");
const maturityCapabilitiesPath = resolve(repositoryRoot, "shared/workbench-maturity-capabilities.ts");
const classifications = new Set(["usable", "partial", "unusable", "pseudo_entry", "unreachable"]);
const dimensions = new Set(["entry", "journey", "api", "persistence", "isolation", "query_or_idempotency", "states", "accessibility", "evidence"]);
const dimensionStates = new Set(["proven", "gap", "not_applicable"]);
const roles = new Set(["anonymous", "contributor", "admin"]);
const recordKeys = new Set([
  "id", "routeId", "pathname", "requiredRole", "journey", "classification", "dimensions",
  "frontendEvidence", "backendEvidence", "testEvidence", "ledgerIds", "gaps",
]);

test("every visible ready route has one maturity capability record", () => {
  const { routes, maturity } = loadContracts();
  const visible = routes.filter((route) => route.availability === "ready");

  assert.deepEqual(
    maturity.map((item) => item.routeId).sort(),
    visible.map((route) => route.id).sort(),
  );
});

test("maturity records are structural, complete, and evidence-backed", () => {
  const { routes, maturity } = loadContracts();
  const routesById = new Map(routes.map((route) => [route.id, route]));
  assert.equal(new Set(maturity.map((item) => item.id)).size, maturity.length, "maturity record ids must be unique");
  assert.equal(new Set(maturity.map((item) => item.routeId)).size, maturity.length, "maturity route ids must be unique");

  for (const record of maturity) {
    assert.ok(record.id.length > 0, "maturity record id is required");
    assert.ok(routesById.has(record.routeId), `${record.id} has an unknown routeId`);
    assert.equal(record.pathname, routesById.get(record.routeId).path, `${record.id} pathname must match its route`);
    assert.ok(roles.has(record.requiredRole), `${record.id} has unsupported requiredRole`);
    assert.ok(record.journey.length > 0, `${record.id} journey is required`);
    assert.ok(classifications.has(record.classification), `${record.id} has unsupported classification`);
    assert.deepEqual([...record.dimensions.keys()].sort(), [...dimensions].sort(), `${record.id} must declare every dimension`);

    const evidence = [...record.frontendEvidence, ...record.backendEvidence, ...record.testEvidence];
    for (const [dimension, status] of record.dimensions) {
      assert.ok(dimensionStates.has(status), `${record.id} ${dimension} has unsupported dimension state`);
      if (status === "proven") assert.ok(evidence.length > 0, `${record.id} ${dimension} requires evidence`);
    }
    if ([...record.dimensions.values()].includes("gap")) {
      assert.ok(record.gaps.length > 0, `${record.id} requires gap text for a gap dimension`);
    }
    for (const [name, values] of Object.entries({
      frontendEvidence: record.frontendEvidence,
      backendEvidence: record.backendEvidence,
      testEvidence: record.testEvidence,
      ledgerIds: record.ledgerIds,
    })) {
      assert.ok(values.length > 0, `${record.id} ${name} is required`);
      assert.ok(values.every((value) => value.length > 0), `${record.id} ${name} must contain non-empty strings`);
    }
    assert.ok(record.gaps.every((gap) => gap.length > 0), `${record.id} gaps must contain non-empty strings`);
  }
});

function loadContracts() {
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [routeCapabilitiesPath, maturityCapabilitiesPath] });
  try {
    return {
      routes: routeRecords(sourceFile(snapshot, routeCapabilitiesPath), "WORKSPACE_ROUTE_CAPABILITIES"),
      maturity: maturityRecords(sourceFile(snapshot, maturityCapabilitiesPath)),
    };
  } finally {
    snapshot.dispose();
    api.close();
  }
}

function sourceFile(snapshot, path) {
  const project = snapshot.getDefaultProjectForFile(path);
  const source = project?.program.getSourceFile(path);
  assert.ok(source, `${path} is required`);
  assert.equal(source.parseDiagnostics?.length ?? 0, 0, `${path} must parse without diagnostics`);
  return source;
}

function routeRecords(source, declarationName) {
  return arrayRecords(source, declarationName).map((entry, index) => {
    const properties = objectProperties(entry, `route ${index}`);
    return {
      id: requiredString(properties, "id", `route ${index}`),
      path: requiredString(properties, "path", `route ${index}`),
      availability: requiredString(properties, "availability", `route ${index}`),
    };
  });
}

function maturityRecords(source) {
  return arrayRecords(source, "WORKBENCH_MATURITY_CAPABILITIES").map((entry, index) => {
    const context = `maturity record ${index}`;
    const properties = objectProperties(entry, context);
    assert.deepEqual(new Set(properties.keys()), recordKeys, `${context} must use the supported record fields`);
    return {
      id: requiredString(properties, "id", context),
      routeId: requiredString(properties, "routeId", context),
      pathname: requiredString(properties, "pathname", context),
      requiredRole: requiredString(properties, "requiredRole", context),
      journey: requiredString(properties, "journey", context),
      classification: requiredString(properties, "classification", context),
      dimensions: stringRecord(source, properties.get("dimensions"), `${context} dimensions`),
      frontendEvidence: stringArray(source, properties.get("frontendEvidence"), `${context} frontendEvidence`),
      backendEvidence: stringArray(source, properties.get("backendEvidence"), `${context} backendEvidence`),
      testEvidence: stringArray(source, properties.get("testEvidence"), `${context} testEvidence`),
      ledgerIds: stringArray(source, properties.get("ledgerIds"), `${context} ledgerIds`),
      gaps: stringArray(source, properties.get("gaps"), `${context} gaps`),
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
  const record = new Map();
  for (const [key, value] of properties) record.set(key, requiredString(new Map([[key, value]]), key, context));
  return record;
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
