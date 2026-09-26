// @vitest-environment node
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetDropzone } from "../../frontend/components/assets/asset-dropzone";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript {
  runInContext(context: Record<string, unknown>) {
    for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) {
      context[name] = (globalThis as unknown as Record<string, unknown>)[name];
    }
  }
}
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));

const { Window } = await import("happy-dom");

let browser: InstanceType<typeof Window>;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  browser = new Window({ url: "https://app.test/submit" });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", browser.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  await browser.happyDOM.close();
  vi.unstubAllGlobals();
});
function drop(files: File[]) {
  const event = new browser.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files } });
  act(() => host.querySelector("section")!.dispatchEvent(event as unknown as Event));
}
async function waitForUpload() {
  for (let attempt = 0; attempt < 40; attempt++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    if (!host.querySelector("input")!.disabled) return;
  }
  throw new Error("Upload did not settle");
}
const locale = createLocaleRuntime({ navigatorLanguage: "en-US" });
describe("Asset picker recovery", () => {
  it.each([
    [[new File(["xx"], "big.pdf")], "upload limit"],
    [[new File(["x"], "bad.exe")], "not supported"],
    [[new File(["x"], "a.pdf"), new File(["x"], "b.pdf")], "one file"],
  ] as const)("shows the rejection without uploading (%j)", (files, message) => {
    const onFiles = vi.fn(async () => {});
    act(() => root.render(<AssetDropzone enabled locale={locale} maxBytes={1} onFiles={onFiles} />));
    drop([...files]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(onFiles).not.toHaveBeenCalled();
    expect(host.querySelector("input")!.multiple).toBe(false);
  });
  it("ignores empty selection and preserves the disabled storage boundary", () => {
    const onFile = vi.fn();
    act(() => root.render(<AssetDropzone enabled locale={locale} onFile={onFile} />));
    drop([]);
    expect(onFile).not.toHaveBeenCalled();
    act(() => root.render(<AssetDropzone locale={locale} onFile={onFile} />));
    drop([new File(["x"], "a.pdf")]);
    expect(onFile).not.toHaveBeenCalled();
    expect(host.querySelector("input")!.disabled).toBe(true);
  });
  it("renders progress, blocks repeated drops, and clears validation on a valid upload", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const onFiles = vi.fn(async () => { await gate; });
    act(() => root.render(<AssetDropzone enabled locale={locale} onFiles={onFiles} />));
    drop([new File(["x"], "bad.exe")]);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    const files = [new File(["x"], "a.pdf")];
    await act(async () => { drop(files); drop(files); });
    expect(onFiles).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('[data-upload-status="processing"]')).not.toBeNull();
    expect(host.querySelector("input")!.disabled).toBe(true);
    await act(async () => { release(); await gate; });
    await waitForUpload();
    expect(host.querySelector('[data-upload-status="succeeded"]')).not.toBeNull();
    expect(host.querySelector("input")!.disabled).toBe(false);
  });
  it("shows a recoverable failure without leaking the thrown server message", async () => {
    const onFiles = vi.fn(async () => { throw new Error("private server detail"); });
    act(() => root.render(<AssetDropzone enabled locale={locale} onFiles={onFiles} />));
    await act(async () => { drop([new File(["x"], "a.pdf")]); });
    await waitForUpload();
    expect(host.querySelector('[data-upload-status="failed"]')).not.toBeNull();
    expect(host.textContent).not.toContain("private server detail");
    expect(host.querySelector("input")!.disabled).toBe(false);
  });
});
