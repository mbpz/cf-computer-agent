import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appSource = () => readFile(resolve(repositoryRoot, "frontend/app.tsx"), "utf8");
const shellSource = () => readFile(resolve(repositoryRoot, "frontend/components/shell/app-shell.tsx"), "utf8");
const localeSource = () => readFile(resolve(repositoryRoot, "frontend/lib/i18n.ts"), "utf8");

test("anonymous bootstrap imports the LoginPage component it renders", async () => {
  const source = await appSource();
  assert.match(source, /import \{ LoginPage \} from ["']\.\/pages\/login-page["'];/u);
});

test("anonymous and session-error branches stay wired to LoginPage", async () => {
  const source = await appSource();
  assert.match(source, /return <LoginPage locale=\{locale\}[^>]*\/>;/u);
  assert.match(source, /return <LoginPage locale=\{locale\} error=[^>]*\/>;/u);
});

test("the application shell keeps account actions out of the topbar and removes free-tier copy", async () => {
  const [shell, locale] = await Promise.all([shellSource(), localeSource()]);
  assert.match(shell, /data-shell-account-footer/u);
  assert.match(shell, /data-shell-mobile-account-footer/u);
  assert.doesNotMatch(shell, /SHELL_FREE_TIER_LABEL/u);
  assert.doesNotMatch(locale, /SHELL_FREE_TIER_LABEL/u);
});
