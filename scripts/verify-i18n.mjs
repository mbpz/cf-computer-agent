import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(argument("--root") || new URL("../", import.meta.url).pathname);
const publicRoot = resolve(root, "public");
const errors = [];
const checkedKeys = new Set();
let placeholderCount = 0;

const en = await importCatalog(resolve(publicRoot, "locales/en.js"), "en");
const zhCN = await importCatalog(resolve(publicRoot, "locales/zh-CN.js"), "zhCN");
const enKeys = Object.keys(en).sort();
const zhKeys = Object.keys(zhCN).sort();

if (!same(enKeys, zhKeys)) {
  errors.push(`[fail] locale-key-parity en=${enKeys.length} zh-CN=${zhKeys.length}`);
}
for (const key of enKeys.filter((candidate) => Object.hasOwn(zhCN, candidate))) {
  const left = placeholders(en[key]);
  const right = placeholders(zhCN[key]);
  placeholderCount += left.length;
  if (!same(left, right)) errors.push(`[fail] placeholder-parity key=${key}`);
}

const files = (await walk(publicRoot))
  .filter((path) => (/\.(?:js|html)$/u.test(path)))
  .filter((path) => !path.includes("/vendor/") && !path.includes("/locales/"));
for (const path of files) {
  const source = await readFile(path, "utf8");
  if (path.endsWith(".html")) scanHtml(path, source);
  else scanJavaScript(path, source);
}

for (const key of checkedKeys) {
  if (!Object.hasOwn(en, key)) errors.push(`[fail] unknown-key key=${key}`);
}

if (errors.length) {
  for (const error of [...new Set(errors)]) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`[pass] i18n keys=${enKeys.length} placeholders=${placeholderCount} files=${files.length}`);
  console.log("[pass] i18n-hardcoded-copy");
}

async function importCatalog(path, exportName) {
  try {
    const url = pathToFileURL(path);
    url.searchParams.set("verify", String(Date.now()));
    const module = await import(url.href);
    const catalog = module[exportName];
    if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) throw new Error();
    return catalog;
  } catch {
    console.error(`[fail] locale-load ${exportName}`);
    process.exit(1);
  }
}

function scanJavaScript(path, source) {
  for (const match of source.matchAll(/\bt\(\s*["']([A-Z][A-Z0-9_]*)["']/gu)) checkedKeys.add(match[1]);
  for (const match of source.matchAll(/(?:labelKey|data-i18n-key)["']?\s*:\s*["']([A-Z][A-Z0-9_]*)["']/gu)) {
    checkedKeys.add(match[1]);
  }
  const sinkPatterns = [
    /(?:text|placeholder|aria-label|accessibleName|label|description|confirmLabel|emptyLabel|fieldLabel|message|statusMessage|title)["']?\s*:\s*(["'`])([^\n]*?)\1/gu,
    /(?:\.textContent|\.innerText|document\.title|\.placeholder|\.ariaLabel)\s*=\s*([^;\n]+)/gu,
    /\b(?:page|card|empty|field|routeLink|setStatus)\(\s*(["'`])([^\n]*?)\1/gu,
    /\b(?:validationSummary|routeStateNode)\([^,]+,\s*(["'`])([^\n]*?)\1/gu,
    /\bsetPending\([^,]+,[^,]+,\s*(["'`])([^\n]*?)\1/gu,
  ];
  for (const pattern of sinkPatterns) {
    for (const match of source.matchAll(pattern)) {
      const candidate = match[2] ?? "";
      if (candidate && humanCopy(candidate)) hardcoded(path, source, match.index);
      if (match[0].includes("document.title") || /\.(?:textContent|innerText|placeholder|ariaLabel)\s*=/u.test(match[0])) {
        for (const literal of match[0].matchAll(/["'`]([^"'`]+)["'`]/gu)) {
          if (humanCopy(literal[1])) hardcoded(path, source, match.index);
        }
      }
    }
  }
}

function scanHtml(path, source) {
  for (const match of source.matchAll(/data-i18n(?:-aria-label)?="([A-Z][A-Z0-9_]*)"/gu)) checkedKeys.add(match[1]);
  for (const match of source.matchAll(/<(?!script\b|style\b)([A-Za-z][^>]*)>([^<]+)</gu)) {
    const opening = match[1];
    const text = match[2].trim();
    if (!humanCopy(text) || text === "Memory Garden") continue;
    if (!/\bdata-i18n="[A-Z][A-Z0-9_]*"/u.test(opening)) {
      errors.push(`[fail] hardcoded-copy file=${relative(path)} html-text=${compact(text)}`);
    }
  }
  for (const match of source.matchAll(/<[^>]+\saria-label="([^"]+)"[^>]*>/gu)) {
    const tag = match[0];
    if (humanCopy(match[1]) && !/\bdata-i18n-aria-label="[A-Z][A-Z0-9_]*"/u.test(tag)) {
      errors.push(`[fail] hardcoded-copy file=${relative(path)} html-aria=${compact(match[1])}`);
    }
  }
}

function humanCopy(value) {
  if (!value || /^[A-Z][A-Z0-9_]*$/u.test(value)) return false;
  if (/[\p{Script=Han}]/u.test(value)) return true;
  return /(?:^|\s)[A-Za-z]{2,}(?:\s|$|[.,!?…:])/u.test(value);
}

function hardcoded(path, source, index) {
  const line = source.slice(0, index).split("\n").length;
  errors.push(`[fail] hardcoded-copy file=${relative(path)} line=${line}`);
}

function placeholders(value) {
  return [...String(value).matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

function same(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }))).flat().sort();
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function relative(path) { return path.slice(root.length + 1); }
function compact(value) { return value.replace(/\s+/gu, " ").slice(0, 40); }
