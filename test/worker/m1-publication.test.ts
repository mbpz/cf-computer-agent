/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, evictDurableObject, reset, runInDurableObject } from "cloudflare:test";
import { getWorkspace, type WorkspaceClient } from "@cloudflare/computer";
import { beforeEach, describe, expect, it } from "vitest";
import { APP_CONFIG } from "../../src/config";
import type { KnowledgeBase } from "../../src/index";
import { createPublishedContentReader } from "../../src/knowledge/published-content";
import { parseSource } from "../../src/sources/parser";

describe("M1 published content Durable Object", () => {
  beforeEach(async () => {
    await reset();
  });

  it("commits idempotently and persists exact bytes across Durable Object recreation", async () => {
    const markdown = "# Trusted knowledge\n\nDurable published bytes.\n";
    const parsed = await parseSource({ kind: "markdown", content: markdown });
    const input = {
      spaceId: "default",
      knowledgeItemId: "knowledge-1",
      revisionId: "revision-1",
      contentSha256: parsed.contentSha256,
      markdown: parsed.normalizedMarkdown,
    };
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("published-persistence"));

    const first = await stub.commitPublishedContent(input);
    const second = await stub.commitPublishedContent(input);
    expect(second).toEqual(first);
    expect(first).toEqual({
      ok: true,
      value: {
        path: "/workspace/published/default/knowledge-1/revision-1.md",
        contentSha256: parsed.contentSha256,
        bytes: new TextEncoder().encode(parsed.normalizedMarkdown).byteLength,
      },
    });

    await evictDurableObject(stub);
    const afterRecreation = await runInDurableObject(
      stub,
      (instance) => (instance as KnowledgeBase).commitPublishedContent(input),
    );
    expect(afterRecreation).toEqual(first);

    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      const receipt = first.ok ? first.value : undefined;
      expect(receipt).toBeDefined();
      const content = await createPublishedContentReader(workspace).read(receipt!.path, receipt!.contentSha256);
      expect(content).toBe(parsed.normalizedMarkdown);
      expect(await sha256Hex(content)).toBe(parsed.contentSha256);
    } finally {
      disposeWorkspace(workspace);
    }
  });

  it("returns serializable validation and immutable-content conflicts without replacing first bytes", async () => {
    const firstMarkdown = "first published bytes\n";
    const firstHash = await sha256Hex(firstMarkdown);
    const base = {
      spaceId: "default",
      knowledgeItemId: "knowledge-conflict",
      revisionId: "revision-1",
      contentSha256: firstHash,
      markdown: firstMarkdown,
    };
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("published-validation"));

    for (const invalid of [
      { ...base, spaceId: "../default" },
      { ...base, knowledgeItemId: "knowledge/other" },
      { ...base, revisionId: "." },
      { ...base, contentSha256: "0".repeat(64) },
    ]) {
      const result = await stub.commitPublishedContent(invalid);
      expect(result).toMatchObject({ ok: false, error: { status: 400, retryable: false } });
    }

    const over = "x".repeat(APP_CONFIG.maxPublishedContentBytes + 1);
    await expect(stub.commitPublishedContent({ ...base, markdown: over, contentSha256: await sha256Hex(over) }))
      .resolves.toMatchObject({
        ok: false,
        error: { code: "PUBLISHED_CONTENT_TOO_LARGE", status: 413, retryable: false },
      });

    const beforeWrite = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      expect((await beforeWrite.fs.readdir("/")).map((entry) => entry.name)).not.toContain("workspace");
    } finally {
      disposeWorkspace(beforeWrite);
    }

    await expect(stub.commitPublishedContent(base)).resolves.toMatchObject({ ok: true });
    const differentMarkdown = "different published bytes\n";
    await expect(stub.commitPublishedContent({
      ...base,
      markdown: differentMarkdown,
      contentSha256: await sha256Hex(differentMarkdown),
    })).resolves.toEqual({
      ok: false,
      error: {
        code: "PUBLISHED_CONTENT_CONFLICT",
        message: "Published content already exists with different bytes",
        status: 409,
        retryable: false,
      },
    });

    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      await expect(workspace.fs.readFile(
        "/workspace/published/default/knowledge-conflict/revision-1.md",
        "utf8",
      )).resolves.toBe(firstMarkdown);
    } finally {
      disposeWorkspace(workspace);
    }
  });

  it("fails a request-scoped read closed when stored bytes no longer match the authorized hash", async () => {
    const markdown = "published integrity\n";
    const contentSha256 = await sha256Hex(markdown);
    const path = "/workspace/published/default/knowledge-corruption/revision-1.md";
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("published-corruption"));
    await expect(stub.commitPublishedContent({
      spaceId: "default",
      knowledgeItemId: "knowledge-corruption",
      revisionId: "revision-1",
      contentSha256,
      markdown,
    })).resolves.toMatchObject({ ok: true });

    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      await workspace.fs.writeFile(path, "tampered integrity\n");
      const reader = createPublishedContentReader(workspace);
      await expect(reader.read(path, contentSha256)).rejects.toMatchObject({
        code: "PUBLISHED_CONTENT_CORRUPT",
        message: "Published content failed its integrity check",
        status: 500,
        retryable: false,
      });
    } finally {
      disposeWorkspace(workspace);
    }
  });
});

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function disposeWorkspace(workspace: WorkspaceClient): void {
  const disposeSymbol = (Symbol as typeof Symbol & { dispose?: symbol }).dispose;
  const disposable = workspace as unknown as Record<symbol, unknown>;
  const dispose = disposeSymbol ? disposable[disposeSymbol] : undefined;
  if (typeof dispose === "function") dispose.call(workspace);
}
