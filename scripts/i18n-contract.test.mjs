import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Window } from "happy-dom";

import { createI18n, createTranslationBindings, LOCALE_STORAGE_KEY, translateEnglish } from "../public/i18n.js";
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

test("catalog lookup only accepts own keys and falls back safely for prototype names", () => {
  const i18n = createI18n({ navigatorLanguage: "en", storedLocale: "en" });
  for (const key of ["__proto__", "constructor", "toString"]) {
    assert.equal(i18n.t(key), key);
    assert.equal(translateEnglish(key), key);
  }
});

test("translation bindings refresh existing text, safe attributes, and title without replacing UI state", () => {
  const window = new Window();
  const i18n = createI18n({ navigatorLanguage: "en", storedLocale: "en" });
  const bindings = createTranslationBindings((key, values) => i18n.t(key, values));
  const textNode = window.document.createTextNode("");
  window.document.body.append(textNode);
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
  bindings.attribute(ariaNode, "alt", bindings.value("COMMON_TITLE"));
  bindings.property(pageDocument, "title", bindings.value("APP_TITLE"));
  assert.equal(textNode.data, en.HOME_TITLE);
  assert.equal(aria.get("aria-label"), en.SEARCH_ARIA_QUERY);
  assert.equal(aria.get("alt"), en.COMMON_TITLE);
  assert.equal(pageDocument.title, en.APP_TITLE);

  i18n.setLocale("zh-CN");
  bindings.refresh();
  assert.equal(textNode.data, zhCN.HOME_TITLE);
  assert.equal(aria.get("aria-label"), zhCN.SEARCH_ARIA_QUERY);
  assert.equal(aria.get("alt"), zhCN.COMMON_TITLE);
  assert.equal(pageDocument.title, zhCN.APP_TITLE);
  assert.deepEqual(retainedState, before);
  window.close();
});

test("localized label bindings preserve nested form controls, values, selection, and focus in a real DOM", () => {
  const window = new Window();
  try {
    const { document } = window;
    const i18n = createI18n({ navigatorLanguage: "en", storedLocale: "en" });
    const bindings = createTranslationBindings((key, values) => i18n.t(key, values));
    const input = document.createElement("input");
    const select = document.createElement("select");
    const textarea = document.createElement("textarea");
    const inputLabel = document.createElement("label");
    const selectLabel = document.createElement("label");
    const textareaLabel = document.createElement("label");
    const firstOption = document.createElement("option");
    firstOption.value = "first";
    const secondOption = document.createElement("option");
    secondOption.value = "second";
    select.append(firstOption, secondOption);

    bindings.text(inputLabel, bindings.value("COMMON_TITLE"));
    bindings.text(selectLabel, bindings.value("COMMON_STATUS"));
    bindings.text(textareaLabel, bindings.value("COMMON_SUMMARY"));
    inputLabel.append(input);
    selectLabel.append(select);
    textareaLabel.append(textarea);
    document.body.append(inputLabel, selectLabel, textareaLabel);

    input.value = "draft title";
    select.value = "second";
    textarea.value = "draft summary";
    input.focus();
    input.setSelectionRange(2, 7);

    i18n.setLocale("zh-CN");
    bindings.refresh();

    assert.equal(inputLabel.firstChild?.nodeType, window.Node.TEXT_NODE);
    assert.equal(inputLabel.firstChild?.textContent, zhCN.COMMON_TITLE);
    assert.ok(inputLabel.lastChild === input, "input node identity was replaced");
    assert.ok(selectLabel.lastChild === select, "select node identity was replaced");
    assert.ok(textareaLabel.lastChild === textarea, "textarea node identity was replaced");
    assert.equal(input.value, "draft title");
    assert.equal(select.value, "second");
    assert.equal(textarea.value, "draft summary");
    assert.ok(document.activeElement === input, "input focus was lost");
    assert.equal(input.selectionStart, 2);
    assert.equal(input.selectionEnd, 7);
  } finally {
    window.close();
  }
});

test("replacing localized text with runtime content removes the stale translation binding", () => {
  const window = new Window();
  const i18n = createI18n({ navigatorLanguage: "en", storedLocale: "en" });
  const bindings = createTranslationBindings((key, values) => i18n.t(key, values));
  const status = window.document.createElement("p");
  window.document.body.append(status);
  bindings.text(status, bindings.value("COMMON_OPERATION_FAILED"));
  bindings.text(status, "Runtime status");

  i18n.setLocale("zh-CN");
  bindings.refresh();

  assert.equal(status.textContent, "Runtime status");
  window.close();
});

test("binding checked-in shell text reuses its text node instead of duplicating copy", () => {
  const window = new Window();
  try {
    const button = window.document.createElement("button");
    button.append("Loading shell copy");
    window.document.body.append(button);
    const i18n = createI18n({ navigatorLanguage: "en", storedLocale: "en" });
    const bindings = createTranslationBindings((key, values) => i18n.t(key, values));

    bindings.text(button, bindings.value("SHELL_LOGOUT"));

    assert.equal(button.childNodes.length, 1);
    assert.equal(button.firstChild?.nodeType, window.Node.TEXT_NODE);
    assert.equal(button.textContent, en.SHELL_LOGOUT);
  } finally {
    window.close();
  }
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

test("AST verifier rejects direct, rejected, stored, option-object, and visible-attribute bypasses", async () => {
  const mutations = [
    { label: "direct Error call", suffix: '\nthrow Error("Direct thrown English error");\n' },
    { label: "direct thrown value", suffix: '\nthrow "Direct thrown English value";\n' },
    { label: "DOMException", suffix: '\nthrow new DOMException("DOM exception English error");\n' },
    { label: "rejected display error", suffix: '\nPromise.reject("Rejected displayed English error");\n' },
    {
      label: "stored displayed error",
      suffix: '\nconst storedDisplayedError = new Error("Stored displayed English error");\nsetStatus(storedDisplayedError.message, "error");\n',
    },
    {
      label: "stored display object",
      suffix: '\nconst storedDisplayState = { error: "Stored object English error" };\nsetStatus(storedDisplayState.error, "error");\n',
    },
    {
      label: "variable element options",
      suffix: '\nconst variableElementOptions = { text: "Variable options English copy" };\nelement("p", variableElementOptions);\n',
    },
    { label: "setAttribute alt", suffix: '\ndocument.body.setAttribute("alt", "Dynamic alternate English copy");\n' },
    {
      label: "setAttribute value",
      suffix: '\nelement("input", { type: "submit" }).setAttribute("value", "Dynamic button English value");\n',
    },
  ];
  for (const mutation of mutations) {
    await withWorkspace(async (root) => {
      await mutate(root, "public/app.js", (source) => source + mutation.suffix);
      await expectFailure(root, /hardcoded-copy/u, mutation.label);
    });
  }
});

test("HTML verifier rejects alternate text, visible submit values, and template content", async () => {
  const mutations = [
    { label: "HTML alt", html: '<img alt="Hardcoded alternate English text">' },
    { label: "HTML submit value", html: '<input type="submit" value="Hardcoded submit English value">' },
    { label: "HTML template content", html: "<template>Hardcoded template English text</template>" },
  ];
  for (const mutation of mutations) {
    await withWorkspace(async (root) => {
      await mutate(root, "public/index.html", (source) => source.replace("</body>", `${mutation.html}</body>`));
      await expectFailure(root, /hardcoded-copy/u, mutation.label);
    });
  }
  await withWorkspace(async (root) => {
    await mutate(root, "public/index.html", (source) => source.replace(
      "</body>",
      '<input type="hidden" value="opaque technical request token"></body>',
    ));
    const result = await runVerifier(root);
    assert.equal(result.code, 0, `non-visible form value: ${result.output}`);
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

async function expectFailure(root, pattern, label = "mutation") {
  const result = await runVerifier(root);
  assert.notEqual(result.code, 0, `${label}: ${result.output}`);
  assert.match(result.output, pattern, label);
}
