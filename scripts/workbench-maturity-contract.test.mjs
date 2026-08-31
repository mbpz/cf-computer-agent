import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { API } from "typescript/unstable/sync";
import { NodeFlags } from "typescript/unstable/ast";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isFunctionDeclaration,
  isIdentifier,
  isIfStatement,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isRegularExpressionLiteral,
  isReturnStatement,
  isSatisfiesExpression,
  isStringLiteral,
  isVariableDeclaration,
  isVariableDeclarationList,
} from "typescript/unstable/ast/is";

const repositoryRoot = resolve(import.meta.dirname, "..");
const routeCapabilitiesPath = resolve(repositoryRoot, "shared/workspace-route-capabilities.ts");
const appRoutesPath = resolve(repositoryRoot, "frontend/app-routes.ts");
const maturityCapabilitiesPath = resolve(repositoryRoot, "shared/workbench-maturity-capabilities.ts");
const classifications = new Set(["usable", "partial", "unusable", "pseudo_entry", "unreachable"]);
const dimensions = new Set(["entry", "journey", "api", "persistence", "isolation", "query_or_idempotency", "states", "accessibility", "evidence"]);
const dimensionStates = new Set(["proven", "gap", "not_applicable"]);
const roles = new Set(["anonymous", "contributor", "admin"]);
const menuRecordKeys = new Set([
  "id", "routeId", "pathname", "requiredRole", "journey", "classification", "dimensions",
  "frontendEvidence", "backendEvidence", "testEvidence", "ledgerIds", "gaps",
]);
const parameterizedRecordKeys = new Set([...menuRecordKeys, "parentRouteId", "routePattern"]);

test("every visible ready route has one maturity capability record", () => {
  const { routes, parameterizedRoutes, maturity } = loadContracts();
  const visible = routes.filter((route) => route.availability === "ready");
  const menuMaturity = maturity.filter((item) => item.routePattern === undefined);
  const parameterizedMaturity = maturity.filter((item) => item.routePattern !== undefined);

  assert.deepEqual(
    menuMaturity.map((item) => item.routeId).sort(),
    visible.map((route) => route.id).sort(),
  );
  assert.deepEqual(
    parameterizedMaturity.map((item) => ({ routeId: item.routeId, routePattern: item.routePattern })).sort(byRouteId),
    parameterizedRoutes.map((route) => ({ routeId: route.routeId, routePattern: route.routePattern })).sort(byRouteId),
  );
});

test("maturity records are structural, complete, and evidence-backed", () => {
  const { routes, parameterizedRoutes, maturity } = loadContracts();
  const routesById = new Map(routes.map((route) => [route.id, route]));
  const parameterizedById = new Map(parameterizedRoutes.map((route) => [route.routeId, route]));
  assert.equal(new Set(maturity.map((item) => item.id)).size, maturity.length, "maturity record ids must be unique");
  assert.equal(new Set(maturity.map((item) => item.routeId)).size, maturity.length, "maturity route ids must be unique");

  for (const record of maturity) {
    assert.ok(record.id.length > 0, "maturity record id is required");
    if (record.routePattern === undefined) {
      assert.ok(routesById.has(record.routeId), `${record.id} has an unknown routeId`);
      assert.equal(record.pathname, routesById.get(record.routeId).path, `${record.id} pathname must match its route`);
      assert.equal(record.parentRouteId, undefined, `${record.id} menu route must not declare a parentRouteId`);
    } else {
      const sourceRoute = parameterizedById.get(record.routeId);
      assert.ok(sourceRoute, `${record.id} has an unknown parameterized routeId`);
      assert.equal(record.routePattern, sourceRoute.routePattern, `${record.id} routePattern must match frontend/app-routes.ts`);
      assert.ok(record.parentRouteId && routesById.has(record.parentRouteId), `${record.id} parameterized route requires a menu parentRouteId`);
      const parentPath = routesById.get(record.parentRouteId).path;
      assert.equal(record.pathname, `${parentPath === "/" ? "" : parentPath}/:id`, `${record.id} pathname must be the parent route template`);
    }
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

test("AST extraction fails closed on syntax diagnostics and mutable indirection", () => {
  withMaturityFixture(maturityFixture({ trailing: "]" }), (snapshot, path) => {
    assert.throws(
      () => maturityRecords(sourceFile(snapshot, path)),
      /must parse without syntactic diagnostics/u,
    );
  });
  withMaturityFixture(maturityFixture({ declaration: "let" }), (snapshot, path) => {
    assert.throws(
      () => maturityRecords(sourceFile(snapshot, path)),
      /must resolve through a const declaration/u,
    );
  });
});

function loadContracts() {
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [routeCapabilitiesPath, maturityCapabilitiesPath] });
  try {
    return {
      routes: routeRecords(sourceFile(snapshot, routeCapabilitiesPath), "WORKSPACE_ROUTE_CAPABILITIES"),
      parameterizedRoutes: parameterizedRouteRecords(sourceFile(snapshot, appRoutesPath)),
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
  const diagnostics = project.program.getSyntacticDiagnostics(path);
  assert.equal(diagnostics.length, 0, `${path} must parse without syntactic diagnostics`);
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
    const isParameterized = properties.has("routePattern");
    assert.deepEqual(
      new Set(properties.keys()),
      isParameterized ? parameterizedRecordKeys : menuRecordKeys,
      `${context} must use the supported record fields`,
    );
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
      parentRouteId: optionalString(properties, "parentRouteId", context),
      routePattern: optionalString(properties, "routePattern", context),
    };
  });
}

function parameterizedRouteRecords(source) {
  const declarations = [];
  const visit = (node) => {
    if (isFunctionDeclaration(node) && node.name?.text === "pageKindForPath") declarations.push(node);
    node.forEachChild(visit);
  };
  visit(source);
  assert.equal(declarations.length, 1, "frontend/app-routes.ts must declare pageKindForPath exactly once");
  assert.ok(declarations[0].body, "pageKindForPath body is required");
  return declarations[0].body.statements.filter(isIfStatement).map((statement, index) => parameterizedRouteRecord(statement, index));
}

function parameterizedRouteRecord(statement, index) {
  const context = `parameterized route ${index}`;
  assert.ok(isCallExpression(statement.expression), `${context} condition must call RegExp.test`);
  const condition = statement.expression;
  assert.ok(isPropertyAccessExpression(condition.expression), `${context} condition must access RegExp.test`);
  assert.equal(condition.expression.name.text, "test", `${context} condition must call RegExp.test`);
  assert.ok(isRegularExpressionLiteral(condition.expression.expression), `${context} matcher must be a regex literal`);
  assert.equal(condition.arguments.length, 1, `${context} matcher must receive pathname once`);
  assert.ok(isIdentifier(condition.arguments[0]) && condition.arguments[0].text === "pathname", `${context} matcher must receive pathname`);
  assert.ok(isReturnStatement(statement.thenStatement) && isStringLiteral(statement.thenStatement.expression), `${context} must return a string route identity`);
  return { routeId: statement.thenStatement.expression.text, routePattern: condition.expression.expression.getText() };
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

function optionalString(properties, name, context) {
  if (!properties.has(name)) return undefined;
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
  const record = new Map();
  for (const [key, value] of properties) record.set(key, requiredString(new Map([[key, value]]), key, context));
  return record;
}

function staticExpression(source, expression, context) {
  expression = unwrapExpression(expression);
  if (isIdentifier(expression)) {
    const declaration = variableDeclaration(source, expression.text);
    assert.ok(
      isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & NodeFlags.Const) !== 0,
      `${context} ${expression.text} must resolve through a const declaration`,
    );
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

function withMaturityFixture(source, action) {
  const directory = mkdtempSync(resolve(tmpdir(), "workbench-maturity-contract-"));
  const path = resolve(directory, "workbench-maturity-capabilities.ts");
  writeFileSync(path, source);
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [path] });
  try {
    action(snapshot, path);
  } finally {
    snapshot.dispose();
    api.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function maturityFixture({ declaration = "const", trailing = "" } = {}) {
  return `
    ${declaration} INITIAL_DIMENSIONS = {
      entry: "proven", journey: "gap", api: "gap", persistence: "gap", isolation: "gap",
      query_or_idempotency: "gap", states: "gap", accessibility: "gap", evidence: "gap",
    };
    ${declaration} INITIAL_GAPS = ["fixture gap"];
    export const WORKBENCH_MATURITY_CAPABILITIES = Object.freeze([{
      id: "fixture", routeId: "fixture", pathname: "/fixture", requiredRole: "contributor",
      journey: "Fixture journey", classification: "partial", dimensions: INITIAL_DIMENSIONS,
      frontendEvidence: ["frontend.tsx"], backendEvidence: ["backend.ts"], testEvidence: ["test.ts"],
      ledgerIds: ["FIX-001"], gaps: INITIAL_GAPS,
    }]);
    ${trailing}
  `;
}

function byRouteId(left, right) {
  return left.routeId.localeCompare(right.routeId);
}
