import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createI18n, createTranslationBindings, LOCALE_STORAGE_KEY } from "../public/i18n.js";
import { en } from "../public/locales/en.js";
import { zhCN } from "../public/locales/zh-CN.js";

const repositoryRoot = new URL("../", import.meta.url);
const verifierPath = new URL("./verify-i18n.mjs", import.meta.url).pathname;

test("locale packs have exact key and placeholder parity", () => {
  const enKeys = Object.keys(en).sort();
  const zhKeys = Object.keys(zhCN).sort();
  assert.ok(enKeys.length >= 150, `expected complete UI coverage, received ${enKeys.length} keys`);
  assert.deepEqual(zhKeys, enKeys);
  for (const key of enKeys) {
    assert.deepEqual(placeholders(zhCN[key]), placeholders(en[key]), key);
  }
  assert.ok(Object.isFrozen(en));
  assert.ok(Object.isFrozen(zhCN));
});

test("selects a valid stored preference before browser language and falls back safely", () => {
  assert.equal(createI18n({ navigatorLanguage: "zh-Hans", storedLocale: undefined }).locale, "zh-CN");
  assert.equal(createI18n({ navigatorLanguage: "en-GB", storedLocale: undefined }).locale, "en");
  assert.equal(createI18n({ navigatorLanguage: "zh-CN", storedLocale: "en" }).locale, "en");
  assert.equal(createI18n({ navigatorLanguage: "en", storedLocale: "forged" }).locale, "en");
  assert.equal(createI18n({
    navigatorLanguage: "zh-CN",
    storedLocale: undefined,
    storage: { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } },
  }).locale, "zh-CN");
});

test("switching persists, notifies once, validates interpolation, and never treats values as HTML", () => {
  const writes = [];
  const storage = {
    getItem() { return null; },
    setItem(key, value) { writes.push([key, value]); },
  };
  const i18n = createI18n({ navigatorLanguage: "en", storedLocale: undefined, storage });
  const notifications = [];
  const unsubscribe = i18n.subscribe((locale) => notifications.push(locale));

  assert.equal(i18n.setLocale("zh-CN"), true);
  assert.equal(i18n.setLocale("zh-CN"), false);
  assert.deepEqual(writes, [[LOCALE_STORAGE_KEY, "zh-CN"]]);
  assert.deepEqual(notifications, ["zh-CN"]);
  assert.equal(i18n.t("INTERPOLATION_TEST", { name: "<img src=x onerror=alert(1)>" }),
    "你好，<img src=x onerror=alert(1)>");
  assert.throws(() => i18n.t("INTERPOLATION_TEST"), /placeholder/iu);
  assert.throws(() => i18n.t("INTERPOLATION_TEST", { name: "Ada", extra: "x" }), /placeholder/iu);
  assert.equal(i18n.t("RUNTIME_UNKNOWN_KEY"), "RUNTIME_UNKNOWN_KEY");
  unsubscribe();
  i18n.setLocale("en");
  assert.deepEqual(notifications, ["zh-CN"]);
});

test("translation bindings refresh existing text, safe attributes, and title without replacing UI state", () => {
  const i18n = createI18n({ navigatorLanguage: "en", storedLocale: "en" });
  const bindings = createTranslationBindings((key, values) => i18n.t(key, values));
  const textNode = { textContent: "", isConnected: true };
  const aria = new Map();
  const ariaNode = { isConnected: true, setAttribute(name, value) { aria.set(name, value); } };
  const pageDocument = { title: "" };
  const retainedState = {
    formValue: "draft answer",
    selection: "collection-1",
    drawerOpen: true,
    focused: "language-select",
  };
  const before = structuredClone(retainedState);

  bindings.text(textNode, bindings.value("HOME_TITLE"));
  bindings.attribute(ariaNode, "aria-label", bindings.value("SEARCH_ARIA_QUERY"));
  bindings.property(pageDocument, "title", bindings.value("APP_TITLE"));
  assert.equal(textNode.textContent, en.HOME_TITLE);
  assert.equal(aria.get("aria-label"), en.SEARCH_ARIA_QUERY);
  assert.equal(pageDocument.title, en.APP_TITLE);

  i18n.setLocale("zh-CN");
  bindings.refresh();
  assert.equal(textNode.textContent, zhCN.HOME_TITLE);
  assert.equal(aria.get("aria-label"), zhCN.SEARCH_ARIA_QUERY);
  assert.equal(pageDocument.title, zhCN.APP_TITLE);
  assert.deepEqual(retainedState, before);
});

test("replacing localized text with runtime content removes the stale translation binding", () => {
  const i18n = createI18n({ navigatorLanguage: "en", storedLocale: "en" });
  const bindings = createTranslationBindings((key, values) => i18n.t(key, values));
  const status = { textContent: "", isConnected: true };
  bindings.text(status, bindings.value("COMMON_OPERATION_FAILED"));
  bindings.text(status, "Runtime status");

  i18n.setLocale("zh-CN");
  bindings.refresh();

  assert.equal(status.textContent, "Runtime status");
});

test("static verifier passes the shipped bilingual UI and reports key and placeholder counts", async () => {
  const result = await runVerifier(repositoryRoot.pathname);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /^\[pass\] i18n keys=\d+ placeholders=\d+ files=\d+$/mu);
  assert.match(result.output, /^\[pass\] i18n-hardcoded-copy ast=typescript html=dom$/mu);
});

test("AST and HTML verifier mutations fail closed across keys, sinks, indirection, encoding, and composition", async () => {
  await withWorkspace(async (root) => {
    await mutate(root, "public/locales/zh-CN.js", (source) => source.replace(/^\s*INTERPOLATION_TEST:.*\n/mu, ""));
    await expectFailure(root, /locale-key-parity/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/locales/zh-CN.js", (source) => source.replace("你好，{name}", "你好，{person}"));
    await expectFailure(root, /placeholder-parity/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => `${source}\ndocument.title = "Hardcoded English copy";\n`);
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => `${source}\ndocument.title = "硬编码中文";\n`);
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => `${source}\ndocument.title = t("UNKNOWN_CHECKED_IN_KEY");\n`);
    await expectFailure(root, /unknown-key/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => `${source}\ndocument.title = "Bypass " + "copy";\n`);
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => `${source}\nconst indirectCopy = "Variable indirect English copy";\ndocument.title = indirectCopy;\n`);
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => source.replace(
      'FORBIDDEN: "ERROR_FORBIDDEN"',
      'FORBIDDEN: "UNKNOWN_DYNAMIC_MAP_KEY"',
    ));
    await expectFailure(root, /unknown-key/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => `${source}\ndocument.body.setAttribute("aria-label", "Set attribute English copy");\n`);
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => `${source}\ndocument.body.append(document.createTextNode("Created text node copy"));\n`);
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => `${source}\nelement("div", {}, ["DOM helper child copy"]);\n`);
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => source
      + '\nconst templateValue = "hardcoded";\ndocument.title = `Template ${templateValue} English copy`;\n');
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => `${source}\ndocument.title = "\\u0048ardcoded\\u0020English\\u0020copy";\n`);
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => `${source}\ndocument.title = "\\u786c\\u7f16\\u7801\\u4e2d\\u6587";\n`);
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/app.js", (source) => `${source}\ndocument.title = atob("SGFyZGNvZGVkIEVuZ2xpc2ggY29weQ==");\n`);
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/index.html", (source) => source.replace("</body>", '<button aria-label="Hardcoded HTML attribute"></button></body>'));
    await expectFailure(root, /hardcoded-copy/u);
  });
  await withWorkspace(async (root) => {
    await mutate(root, "public/index.html", (source) => source.replace("</body>", "<p>Hardcoded HTML text</p></body>"));
    await expectFailure(root, /hardcoded-copy/u);
  });
});

test("static verifier rejects a thrown Markdown renderer message that can reach the error display path", async () => {
  await withWorkspace(async (root) => {
    await mutate(root, "public/markdown-renderer.js", (source) => source.replace(
      "MARKDOWN_RENDERER_UNAVAILABLE",
      "Displayed Markdown renderer English error",
    ));
    await expectFailure(root, /hardcoded-copy/u);
  });
});

function placeholders(value) {
  return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

async function runVerifier(root) {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [verifierPath, "--root", root], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}

async function withWorkspace(callback) {
  const root = await mkdtemp(join(tmpdir(), "memory-garden-i18n-"));
  try {
    await cp(new URL("../public", import.meta.url), join(root, "public"), { recursive: true });
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function mutate(root, relativePath, transform) {
  const path = join(root, relativePath);
  const source = await readFile(path, "utf8");
  await writeFile(path, transform(source), "utf8");
}

async function expectFailure(root, pattern) {
  const result = await runVerifier(root);
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, pattern);
}
