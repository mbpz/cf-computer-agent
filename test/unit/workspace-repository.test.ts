import type { WorkspaceClient } from "@cloudflare/computer";
import { describe, expect, it } from "vitest";
import { ensureDirectory } from "../../src/knowledge/workspace-repository";

function workspaceForMkdir(mkdir: () => Promise<void>): WorkspaceClient {
  return {
    fs: {
      readdir: async () => [],
      mkdir,
    },
  } as unknown as WorkspaceClient;
}

describe("ensureDirectory", () => {
  it.each([
    { code: "EEXIST" },
    new Error("WorkspaceFsError: path exists: /workspace"),
  ])("accepts a concurrent creator's existing directory (%o)", async (error) => {
    const workspace = workspaceForMkdir(async () => { throw error; });

    await expect(ensureDirectory(workspace, "/", "/workspace")).resolves.toBeUndefined();
  });

  it("propagates failures other than an already-existing directory", async () => {
    const failure = new Error("storage unavailable");
    const workspace = workspaceForMkdir(async () => { throw failure; });

    await expect(ensureDirectory(workspace, "/", "/workspace")).rejects.toBe(failure);
  });
});
