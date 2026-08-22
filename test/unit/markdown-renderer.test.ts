// @vitest-environment node

import createDOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vmContexts = new WeakSet<object>();
class InertVmScript {
  runInContext(context: Record<string, unknown>) {
    for (const name of [
      "Array", "ArrayBuffer", "Boolean", "DataView", "Date", "Error", "Function", "Intl", "JSON",
      "Map", "Math", "Number", "Object", "Promise", "Reflect", "RegExp", "Set", "String", "Symbol",
      "TypeError", "Uint8Array", "Uint8ClampedArray", "WeakMap", "WeakSet",
    ]) context[name] = (globalThis as unknown as Record<string, unknown>)[name];
    return undefined;
  }
}
vi.mock("node:vm", () => ({
  default: {
    Script: InertVmScript,
    createContext(value: object) { vmContexts.add(value); return value; },
    isContext(value: object) { return vmContexts.has(value); },
  },
  Script: InertVmScript,
}));
vi.mock("vm", () => ({
  default: {
    Script: InertVmScript,
    createContext(value: object) { vmContexts.add(value); return value; },
    isContext(value: object) { return vmContexts.has(value); },
  },
  Script: InertVmScript,
}));

const { Window } = await import("happy-dom");

describe("safe Markdown renderer", () => {
  let window: InstanceType<typeof Window>;

  beforeEach(() => {
    window = new Window({ settings: { disableJavaScriptEvaluation: true } });
    vi.stubGlobal("document", window.document);
    vi.stubGlobal("markdownit", MarkdownIt);
    vi.stubGlobal("DOMPurify", createDOMPurify(window as never));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.close();
  });

  it("returns a DocumentFragment and leaves raw active HTML inert", async () => {
    const { renderSafeMarkdown } = await import("../../public/markdown-renderer.js");
    const fragment = renderSafeMarkdown(`
# Safe heading

<script>alert(1)</script>
<style>body { display: none }</style>
<iframe src="https://attacker.test"></iframe>
<form action="https://attacker.test"><input autofocus onfocus="alert(1)"></form>
<img src=x onerror="alert(1)">
<svg><a href="javascript:alert(1)">svg</a></svg>
<math><mtext>math</mtext></math>
`);
    const host = window.document.createElement("div");
    host.append(fragment);

    expect(fragment.nodeType).toBe(11);
    expect(host.querySelector("h1")?.textContent).toBe("Safe heading");
    expect(host.querySelector("script,style,iframe,form,input,img,svg,math")).toBeNull();
    expect(host.querySelector("[onerror],[onfocus],[autofocus]")).toBeNull();
    expect(host.textContent).toContain("<script>alert(1)</script>");
  });

  it("rejects encoded and whitespace-obfuscated active URLs while preserving allowlisted protocols", async () => {
    const { renderSafeMarkdown } = await import("../../public/markdown-renderer.js");
    const fragment = renderSafeMarkdown(`
[script](javascript:alert(1))
[entity](jav&#x61;script:alert(1))
[newline](java&#x0A;script:alert(1))
[percent](javascript%3Aalert(1))
[spaced](java%09script:alert(1))
[data](data:text/html;base64,PHNjcmlwdD4=)
[relative](/private/path)
[secure](https://example.test/docs)
[plain](http://example.test/docs)
[mail](mailto:reader@example.test)

Linkified https://linkified.example.test/path.
`);
    const host = window.document.createElement("div");
    host.append(fragment);
    const anchors = [...host.querySelectorAll("a")];

    expect(anchors.map((anchor) => anchor.getAttribute("href"))).toEqual([
      "https://example.test/docs",
      "http://example.test/docs",
      "mailto:reader@example.test",
      "https://linkified.example.test/path",
    ]);
    expect(anchors.every((anchor) => anchor.getAttribute("target") === "_blank")).toBe(true);
    expect(anchors.every((anchor) => anchor.getAttribute("rel") === "noopener noreferrer")).toBe(true);
    expect(host.textContent).toContain("[script](javascript:alert(1))");
  });

  it("renders tables, fenced code, and nested lists without enabling raw HTML", async () => {
    const { renderSafeMarkdown } = await import("../../public/markdown-renderer.js");
    const fragment = renderSafeMarkdown(`
| Name | State |
| --- | --- |
| Reader | safe |

\`\`\`js
const markup = "<script>not executable</script>";
\`\`\`

- outer
  - inner
`);
    const host = window.document.createElement("div");
    host.append(fragment);

    expect(host.querySelector("table tbody td")?.textContent).toBe("Reader");
    expect(host.querySelector("pre code")?.textContent).toContain("<script>not executable</script>");
    expect(host.querySelectorAll("ul")).toHaveLength(2);
    expect(host.querySelector("script")).toBeNull();
  });
});
