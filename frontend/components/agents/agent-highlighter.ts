import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import diff from "shiki/langs/diff.mjs";
import json from "shiki/langs/json.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import githubDarkHighContrast from "shiki/themes/github-dark-high-contrast.mjs";
import githubLightHighContrast from "shiki/themes/github-light-high-contrast.mjs";

export const AGENT_CODE_THEME_NAMES = {
  light: "github-light-high-contrast",
  dark: "github-dark-high-contrast",
} as const;

/**
 * Only the grammars this application renders are bundled, and the JavaScript
 * engine keeps the oniguruma wasm out of the build. Importing the `shiki`
 * barrel instead emits every language and theme as its own chunk (hundreds of
 * files), so this module is the single deliberate entry point and is itself
 * loaded on first use.
 */
export function createAgentCodeHighlighter(): Promise<HighlighterCore> {
  return createHighlighterCore({
    themes: [githubLightHighContrast, githubDarkHighContrast],
    langs: [bash, diff, json, tsx, typescript],
    engine: createJavaScriptRegexEngine(),
  });
}
