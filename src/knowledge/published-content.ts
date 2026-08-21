import type { WorkspaceClient } from "@cloudflare/computer";
import { APP_CONFIG } from "../config";
import { AppError } from "../http";
import type {
  CommitPublishedContentInput,
  PublishedContentReader,
  PublishedContentReceipt,
} from "./types";

const SAFE_PATH_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const WORKSPACE_ROOT = APP_CONFIG.publishedRoot.slice(0, APP_CONFIG.publishedRoot.lastIndexOf("/"));

export interface ValidatedPublishedContent extends PublishedContentReceipt {
  markdown: string;
  spaceDirectory: string;
  itemDirectory: string;
}

export async function validatePublishedContentInput(
  input: CommitPublishedContentInput,
): Promise<ValidatedPublishedContent> {
  if (!input || typeof input !== "object"
    || !isSafePathSegment(input.spaceId)
    || !isSafePathSegment(input.knowledgeItemId)
    || !isSafePathSegment(input.revisionId)
    || typeof input.contentSha256 !== "string"
    || !SHA256_HEX.test(input.contentSha256)
    || typeof input.markdown !== "string"
    || input.markdown.length === 0
    || input.markdown.includes("\0")
    || hasMalformedSurrogate(input.markdown)) {
    throw new AppError("PUBLISHED_CONTENT_INVALID", "Published content input is invalid", 400);
  }

  const bytes = new TextEncoder().encode(input.markdown);
  if (bytes.byteLength > APP_CONFIG.maxPublishedContentBytes) {
    throw new AppError("PUBLISHED_CONTENT_TOO_LARGE", "Published content exceeds 128 KiB", 413);
  }
  if (await sha256Hex(bytes) !== input.contentSha256) {
    throw new AppError("PUBLISHED_CONTENT_HASH_MISMATCH", "Published content hash does not match", 400);
  }

  const spaceDirectory = `${APP_CONFIG.publishedRoot}/${input.spaceId}`;
  const itemDirectory = `${spaceDirectory}/${input.knowledgeItemId}`;
  return {
    path: `${itemDirectory}/${input.revisionId}.md`,
    contentSha256: input.contentSha256,
    bytes: bytes.byteLength,
    markdown: input.markdown,
    spaceDirectory,
    itemDirectory,
  };
}

export async function persistPublishedContent(
  workspace: WorkspaceClient,
  content: ValidatedPublishedContent,
): Promise<PublishedContentReceipt> {
  await ensurePublishedDirectory(workspace, "/", WORKSPACE_ROOT);
  await ensurePublishedDirectory(workspace, WORKSPACE_ROOT, APP_CONFIG.publishedRoot);
  await ensurePublishedDirectory(workspace, APP_CONFIG.publishedRoot, content.spaceDirectory);
  await ensurePublishedDirectory(workspace, content.spaceDirectory, content.itemDirectory);

  const entry = await findEntry(workspace, content.itemDirectory, fileName(content.path));
  if (entry) {
    if (!entry.isFile || entry.isSymbolicLink) throw publishedContentConflict();
    const existing = await workspace.fs.readFile(content.path, "utf8");
    const existingHash = await sha256Hex(new TextEncoder().encode(existing));
    if (existing !== content.markdown || existingHash !== content.contentSha256) {
      throw publishedContentConflict();
    }
    return receipt(content);
  }

  await workspace.fs.writeFile(content.path, content.markdown);
  return receipt(content);
}

export function createPublishedContentReader(workspace: WorkspaceClient): PublishedContentReader {
  return {
    async read(path: string, expectedSha256: string): Promise<string> {
      if (!isPublishedContentPath(path) || !SHA256_HEX.test(expectedSha256)) {
        throw publishedContentCorrupt();
      }

      let content: string;
      try {
        content = await workspace.fs.readFile(path, "utf8");
      } catch {
        throw publishedContentCorrupt();
      }
      const bytes = new TextEncoder().encode(content);
      if (bytes.byteLength > APP_CONFIG.maxPublishedContentBytes
        || await sha256Hex(bytes) !== expectedSha256) {
        throw publishedContentCorrupt();
      }
      return content;
    },
  };
}

function isPublishedContentPath(path: string): boolean {
  if (typeof path !== "string" || !path.startsWith(`${APP_CONFIG.publishedRoot}/`)) return false;
  const segments = path.slice(APP_CONFIG.publishedRoot.length + 1).split("/");
  if (segments.length !== 3) return false;
  const [spaceId, knowledgeItemId, file] = segments;
  if (!file?.endsWith(".md")) return false;
  const revisionId = file.slice(0, -3);
  return isSafePathSegment(spaceId) && isSafePathSegment(knowledgeItemId) && isSafePathSegment(revisionId)
    && path === `${APP_CONFIG.publishedRoot}/${spaceId}/${knowledgeItemId}/${revisionId}.md`;
}

function isSafePathSegment(value: unknown): value is string {
  return typeof value === "string" && SAFE_PATH_SEGMENT.test(value);
}

async function ensurePublishedDirectory(
  workspace: WorkspaceClient,
  parent: string,
  path: string,
): Promise<void> {
  const existing = await findEntry(workspace, parent, fileName(path));
  if (existing) {
    if (!existing.isDirectory || existing.isSymbolicLink) throw publishedContentConflict();
    return;
  }
  try {
    await workspace.fs.mkdir(path);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const concurrent = await findEntry(workspace, parent, fileName(path));
    if (!concurrent?.isDirectory || concurrent.isSymbolicLink) throw publishedContentConflict();
  }
}

async function findEntry(workspace: WorkspaceClient, directory: string, name: string) {
  return (await workspace.fs.readdir(directory)).find((entry) => entry.name === name);
}

function receipt(content: ValidatedPublishedContent): PublishedContentReceipt {
  return {
    path: content.path,
    contentSha256: content.contentSha256,
    bytes: content.bytes,
  };
}

function publishedContentConflict(): AppError {
  return new AppError(
    "PUBLISHED_CONTENT_CONFLICT",
    "Published content already exists with different bytes",
    409,
  );
}

function publishedContentCorrupt(): AppError {
  return new AppError(
    "PUBLISHED_CONTENT_CORRUPT",
    "Published content failed its integrity check",
    500,
  );
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function isAlreadyExists(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate?.code === "EEXIST"
    || (typeof candidate?.message === "string"
      && (candidate.message.includes("EEXIST") || candidate.message.includes("WorkspaceFsError: path exists:")));
}

function hasMalformedSurrogate(content: string): boolean {
  for (let index = 0; index < content.length; index += 1) {
    const unit = content.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = content.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}
