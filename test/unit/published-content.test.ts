import type { WorkspaceClient } from "@cloudflare/computer";
import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "../../src/config";
import {
  createPublishedContentReader,
  persistPublishedContent,
  validatePublishedContentInput,
} from "../../src/knowledge/published-content";
import type { CommitPublishedContentInput } from "../../src/knowledge/types";

describe("published content", () => {
  it("uses one immutable write after creating deterministic directories root-first", async () => {
    const fake = fakeWorkspace();
    const input = await publishedInput("# Trusted knowledge\n");
    const validated = await validatePublishedContentInput(input);

    const first = await persistPublishedContent(fake.workspace, validated);
    const second = await persistPublishedContent(fake.workspace, validated);

    expect(first).toEqual({
      path: "/workspace/published/default/knowledge-1/revision-1.md",
      contentSha256: input.contentSha256,
      bytes: 20,
    });
    expect(second).toEqual(first);
    expect(fake.mkdirPaths).toEqual([
      "/workspace",
      "/workspace/published",
      "/workspace/published/default",
      "/workspace/published/default/knowledge-1",
    ]);
    expect(fake.writePaths).toEqual([first.path]);
  });

  it.each([
    ["spaceId", "../default"],
    ["spaceId", "default/other"],
    ["knowledgeItemId", "knowledge\\other"],
    ["revisionId", "."],
    ["revisionId", ".."],
    ["revisionId", "revision--1"],
  ] as const)("rejects an unsafe %s before persistence", async (field, value) => {
    const input = await publishedInput("safe\n");

    await expect(validatePublishedContentInput({ ...input, [field]: value }))
      .rejects.toMatchObject({ code: "PUBLISHED_CONTENT_INVALID", status: 400, retryable: false });
  });

  it("rejects malformed and mismatched SHA-256 values", async () => {
    const input = await publishedInput("hash checked\n");

    await expect(validatePublishedContentInput({ ...input, contentSha256: "not-a-sha256" }))
      .rejects.toMatchObject({ code: "PUBLISHED_CONTENT_INVALID", status: 400 });
    await expect(validatePublishedContentInput({ ...input, contentSha256: "0".repeat(64) }))
      .rejects.toMatchObject({ code: "PUBLISHED_CONTENT_HASH_MISMATCH", status: 400 });
  });

  it("accepts exactly 128 KiB and rejects the next UTF-8 byte", async () => {
    const exact = "x".repeat(APP_CONFIG.maxPublishedContentBytes);
    const over = `${exact}x`;

    await expect(validatePublishedContentInput(await publishedInput(exact)))
      .resolves.toMatchObject({ bytes: APP_CONFIG.maxPublishedContentBytes });
    await expect(validatePublishedContentInput(await publishedInput(over)))
      .rejects.toMatchObject({ code: "PUBLISHED_CONTENT_TOO_LARGE", status: 413 });
  });

  it("returns a typed conflict and preserves the first bytes when a path already has different content", async () => {
    const fake = fakeWorkspace();
    const first = await validatePublishedContentInput(await publishedInput("first revision bytes\n"));
    const different = await validatePublishedContentInput(await publishedInput("different revision bytes\n"));
    await persistPublishedContent(fake.workspace, first);

    await expect(persistPublishedContent(fake.workspace, different))
      .rejects.toMatchObject({ code: "PUBLISHED_CONTENT_CONFLICT", status: 409, retryable: false });
    expect(fake.writePaths).toEqual([first.path]);
    expect(fake.files.get(first.path)).toBe("first revision bytes\n");
  });

  it("re-reads and accepts matching bytes after an ambiguous exclusive-create EEXIST", async () => {
    const validated = await validatePublishedContentInput(await publishedInput("winner bytes\n"));
    const fake = fakeWorkspace({}, async (path, content, files) => {
      files.set(path, content);
      throw Object.assign(new Error(`EEXIST: ${path}`), { code: "EEXIST" });
    });

    await expect(persistPublishedContent(fake.workspace, validated)).resolves.toEqual({
      path: validated.path,
      contentSha256: validated.contentSha256,
      bytes: validated.bytes,
    });
    expect(fake.writeOptions).toEqual([{ exclusive: true }]);
  });

  it("re-reads and rejects different bytes after a competing exclusive-create EEXIST", async () => {
    const validated = await validatePublishedContentInput(await publishedInput("loser bytes\n"));
    const fake = fakeWorkspace({}, async (path, _content, files) => {
      files.set(path, "competing winner bytes\n");
      throw Object.assign(new Error(`EEXIST: ${path}`), { code: "EEXIST" });
    });

    await expect(persistPublishedContent(fake.workspace, validated))
      .rejects.toMatchObject({ code: "PUBLISHED_CONTENT_CONFLICT", status: 409, retryable: false });
    expect(fake.writeOptions).toEqual([{ exclusive: true }]);
  });

  it("reads only canonical stored paths and verifies their hash before returning content", async () => {
    const input = await publishedInput("authorized bytes\n");
    const path = "/workspace/published/default/knowledge-1/revision-1.md";
    const fake = fakeWorkspace({ [path]: input.markdown });
    const reader = createPublishedContentReader(fake.workspace);

    await expect(reader.read(path, input.contentSha256)).resolves.toBe(input.markdown);
    await expect(reader.read("/workspace/published/default/knowledge-1/../secret.md", input.contentSha256))
      .rejects.toMatchObject({ code: "PUBLISHED_CONTENT_CORRUPT", status: 500 });

    fake.files.set(path, "tampered bytes\n");
    await expect(reader.read(path, input.contentSha256))
      .rejects.toMatchObject({ code: "PUBLISHED_CONTENT_CORRUPT", status: 500, retryable: false });
  });
});

async function publishedInput(markdown: string): Promise<CommitPublishedContentInput> {
  return {
    spaceId: "default",
    knowledgeItemId: "knowledge-1",
    revisionId: "revision-1",
    contentSha256: await sha256Hex(markdown),
    markdown,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fakeWorkspace(
  initialFiles: Record<string, string> = {},
  writeFile?: (path: string, content: string, files: Map<string, string>) => Promise<void>,
): {
  workspace: WorkspaceClient;
  files: Map<string, string>;
  mkdirPaths: string[];
  writePaths: string[];
  writeOptions: Array<{ exclusive?: boolean } | undefined>;
} {
  const directories = new Set(["/"]);
  const files = new Map(Object.entries(initialFiles));
  const mkdirPaths: string[] = [];
  const writePaths: string[] = [];
  const writeOptions: Array<{ exclusive?: boolean } | undefined> = [];
  const workspace = {
    fs: {
      async readdir(path: string) {
        if (!directories.has(path)) throw new Error(`ENOENT: ${path}`);
        const prefix = path === "/" ? "/" : `${path}/`;
        const entries = new Map<string, { isFile: boolean; isDirectory: boolean }>();
        for (const directory of directories) {
          if (directory === path || !directory.startsWith(prefix)) continue;
          const name = directory.slice(prefix.length).split("/", 1)[0]!;
          entries.set(name, { isFile: false, isDirectory: true });
        }
        for (const file of files.keys()) {
          if (!file.startsWith(prefix)) continue;
          const name = file.slice(prefix.length).split("/", 1)[0]!;
          if (!entries.has(name)) entries.set(name, { isFile: true, isDirectory: false });
        }
        return Array.from(entries, ([name, entry]) => ({
          name,
          parentPath: path,
          isSymbolicLink: false,
          ...entry,
        }));
      },
      async mkdir(path: string) {
        mkdirPaths.push(path);
        directories.add(path);
      },
      async writeFile(path: string, content: string, options?: { exclusive?: boolean }) {
        writePaths.push(path);
        writeOptions.push(options);
        if (writeFile) return writeFile(path, content, files);
        files.set(path, content);
      },
      async readFile(path: string, encoding: "utf8") {
        expect(encoding).toBe("utf8");
        const content = files.get(path);
        if (content === undefined) throw new Error(`ENOENT: ${path}`);
        return content;
      },
    },
  } as unknown as WorkspaceClient;
  return { workspace, files, mkdirPaths, writePaths, writeOptions };
}
