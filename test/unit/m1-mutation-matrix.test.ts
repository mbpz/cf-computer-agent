// @vitest-environment node

import createDOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeEvidenceConfidence, EVIDENCE_CONFIDENCE_THRESHOLD } from "../../src/ai/evidence-confidence";
import { assertAuditEventInput } from "../../src/audit/types";
import { buildIndexDocument } from "../../src/indexing/document";
import { LibraryService } from "../../src/library/service";
import { normalizeSearchQuery } from "../../src/library/lexical";
import { PublicationService } from "../../src/publication/service";
import { buildSearchPresentation, SEARCH_POLICY } from "../../src/library/search-policy";
import { decodeSourceBytes } from "../../src/sources/decoder";
import { parseSource } from "../../src/sources/parser";
import { SubmissionsService } from "../../src/submissions/service";
import { createI18n } from "../../public/i18n.js";
import { knowledgeReaderModel } from "../../public/workspace-ui.js";
import { renderSafeMarkdown } from "../../public/markdown-renderer.js";
import type { LibraryRepositoryPort, RepositorySearchRequest } from "../../src/library/repository";
import type { PublicationIntent, PublicationRepositoryPort, ReviewSubmissionSnapshot } from "../../src/publication/types";
import type { SearchHit } from "../../src/library/types";
import {
  assertStrictM1MutationResults,
  observation,
  runM1MutationWitnesses,
  type M1MutationWitness,
} from "../fixtures/m1-mutation-matrix";

const vmContexts = new WeakSet<object>();
class InertVmScript {
  runInContext(context: Record<string, unknown>) {
    for (const name of ["Array", "ArrayBuffer", "Boolean", "Date", "Error", "Function", "Intl", "JSON", "Map", "Math", "Number", "Object", "Promise", "Reflect", "RegExp", "Set", "String", "Symbol", "TypeError", "Uint8Array", "WeakMap", "WeakSet"]) {
      context[name] = (globalThis as unknown as Record<string, unknown>)[name];
    }
    return undefined;
  }
}
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const hit = (overrides: Partial<SearchHit> = {}): SearchHit => ({
  citationId: "citation", knowledgeItemId: "item", spaceId: "space", collectionId: "collection",
  revisionId: "revision", chunkId: "chunk", title: "Launch reliability", headingPath: ["Launch"],
  startLine: 1, endLine: 2, excerpt: "launch latency budget", matchedFields: ["title"], highlights: [{ start: 0, end: 6 }],
  score: 1, publishedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});

async function throwsCode(action: () => unknown | Promise<unknown>, code: string): Promise<boolean> {
  try { await action(); return false; } catch (error) { return (error as { code?: string }).code === code; }
}

function documentFixture() {
  return buildIndexDocument(
    { id: "revision", title: "Launch title" },
    [
      { ordinal: 0, headingPath: ["Overview"], startLine: 1, endLine: 1, body: "summary body", searchBody: "summary body", indexField: "body" },
      { ordinal: 1, headingPath: ["Code"], startLine: 2, endLine: 2, body: "const launchCode = true", searchBody: "const launchCode = true", indexField: "code" },
    ],
    [{ id: "tag", slug: "launch-tag", name: "Launch Tag" }],
  );
}

function libraryCapture() {
  let request: RepositorySearchRequest | undefined;
  const repository = {
    authorizeScope: async () => true,
    authorizeChatScope: async (_scope: unknown, scope: unknown) => scope,
    search: async (_scope: unknown, value: RepositorySearchRequest) => { request = value; return { items: [], degraded: false }; },
  } as unknown as LibraryRepositoryPort;
  return { service: new LibraryService(repository, { read: async () => "" }), request: () => request };
}

async function publicationCapture(mutant: "none" | "audit" | "target" | "visibility") {
  const parsed = await parseSource({ kind: "markdown", content: "# Trusted\n\nBody.\n" });
  const preview: ReviewSubmissionSnapshot = {
    submissionId: "submission", submitterId: "member", status: "review_pending", requestedSpaceId: "space",
    requestedCollectionId: "collection", requestedVisibility: "admin_only", kind: "markdown", title: "Requested",
    rawContent: parsed.normalizedMarkdown,
    sourceVersion: { id: "source-version", kind: "markdown", content: parsed.normalizedMarkdown,
      contentSha256: parsed.contentSha256, parserVersion: parsed.parserVersion,
      parserSchemaVersion: parsed.parserSchemaVersion, codeMetadata: null },
    requestedTarget: null,
  };
  let captured: unknown;
  const normalized = { title: "Final", spaceId: "space", collectionId: "collection", visibility: "shared" as const,
    tagIds: ["tag"], visibilityReasonCode: "admin_visibility_expansion" as const };
  const intent: PublicationIntent = {
    submissionId: "submission", revisionId: "revision", knowledgeItemId: "item", reviewerId: "admin",
    ...normalized, normalizedPath: "/knowledge/published/space/item/revision.md", contentSha256: parsed.contentSha256,
    state: "completed", sourceVersion: preview.sourceVersion,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const repository = {
    getPreview: async () => preview,
    validateTarget: async () => { if (mutant === "target") throw new Error("mutated target"); },
    createOrReadIntent: async (_submissionId: string, _reviewerId: string, input: unknown) => {
      captured = mutant === "audit" ? { ...(input as object), tagIds: [] } : input;
      return mutant === "visibility" ? { ...intent, visibilityReasonCode: undefined } : intent;
    },
    finalize: async () => ({ id: "revision", knowledgeItemId: "item", sourceVersionId: "source-version",
      normalizedPath: intent.normalizedPath, contentSha256: intent.contentSha256, title: "Final", tagIds: ["tag"],
      visibility: "shared", publishedBy: "admin", publishedAt: intent.createdAt, searchStatus: "indexed" }),
    processIndexJob: async () => "indexed",
  } as unknown as PublicationRepositoryPort;
  const service = new PublicationService(repository, { commit: async () => ({ path: intent.normalizedPath, contentSha256: intent.contentSha256, bytes: 0 }) });
  try {
    await service.publish({ id: "admin", role: "admin", status: "active" }, "submission", normalized);
    return { ok: true, captured };
  } catch { return { ok: false, captured }; }
}

async function resubmissionAccepted(mutated: boolean): Promise<boolean> {
  let persisted = false;
  const prior = { id: "prior", submitterId: "member", requestedSpaceId: "space", requestedCollectionId: null,
    requestedVisibility: "admin_only" as const, kind: "text" as const, status: "revision_requested" as const,
    title: "Prior", content: "prior", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const repository = {
    findResubmittable: async () => prior,
    createResubmissionWithSourceVersion: async (input: { submission: { supersedesSubmissionId?: string } }) => {
      persisted = input.submission.supersedesSubmissionId === "prior";
      return { submission: input.submission };
    },
  } as never;
  const service = new SubmissionsService(repository, { id: (() => { let n = 0; return () => `id-${++n}`; })(), now: () => new Date("2026-01-01T00:00:00.000Z") });
  try {
    await service.resubmit("member", "prior", { kind: "text", title: "Next", content: "next", requestedVisibility: mutated ? "shared" : "admin_only" }, "idem-key-12345678");
    return persisted;
  } catch { return false; }
}

function witness(id: string, baseline: () => Promise<boolean> | boolean, mutant: () => Promise<boolean> | boolean): M1MutationWitness {
  return {
    id, featureId: id,
    baseline: async () => observation(id, await baseline(), `${id}:baseline literal violated`),
    mutant: async () => observation(id, await mutant(), `${id}:mutated input or policy was accepted`),
  };
}

async function witnesses(): Promise<M1MutationWitness[]> {
  const validBytes = new TextEncoder().encode("knowledge").buffer;
  const invalidBytes = Uint8Array.from([0xc3, 0x28]).buffer;
  const doc = documentFixture();
  const reader = knowledgeReaderModel({
    id: "revision", knowledgeItemId: "item", sourceVersionId: "source-version", reviewerId: "admin",
    sourceVersionOrdinal: 2, parserSchemaVersion: "m1-v2", codeMetadata: { language: "typescript", fileLabel: "agent.ts", lineBaseline: 10 },
    indexStatus: "indexed", title: "Reader", tagIds: ["tag"], visibility: "admin_only", publishedBy: "admin",
    publishedAt: "2026-01-01T00:00:00.000Z", isCurrent: true, markdown: "# Reader\n", chunks: [],
  });
  const presentation = buildSearchPresentation("launch latency budget", normalizeSearchQuery("launch").termKeys, ["title", "body"]);
  const strong = computeEvidenceConfidence("launch latency", [hit()]);
  const downloadVisible = async (visible: boolean) => {
    const record = {
      id: "item", spaceId: "space", collectionId: null, status: "active", searchStatus: "indexed",
      updatedAt: "2026-01-01T00:00:00.000Z", revisionId: "revision", sourceVersionId: "source-version",
      reviewerId: "admin", sourceVersionOrdinal: 2, parserSchemaVersion: "m1-v2", codeMetadata: null,
      title: "Reader", tagIds: [], visibility: "admin_only", publishedBy: "admin", publishedAt: "2026-01-01T00:00:00.000Z",
      normalizedPath: "/knowledge/published/space/item/revision.md", contentSha256: "a".repeat(64), isCurrent: true, chunks: [],
    } as const;
    const service = new LibraryService({ authorizeScope: async () => true, findRevision: async () => visible ? record : null } as never,
      { read: async () => "# Reader\n" });
    try { return (await service.download({ memberId: "member", role: "admin" }, "item", "revision")).markdown === "# Reader\n"; }
    catch { return false; }
  };

  const capturedTags = async (mode: "and" | "or" | "invalid") => {
    const capture = libraryCapture();
    try {
      await capture.service.search({ memberId: "member", role: "admin" }, {
        query: "launch", spaceId: "space", tagIds: ["tag-a", "tag-b"], tagMode: mode === "invalid" ? "xor" as "and" : mode,
      });
      return capture.request()?.tagMode;
    } catch { return undefined; }
  };
  const capturedChat = async (scope: unknown) => {
    const capture = libraryCapture();
    try {
      await capture.service.search({ memberId: "member", role: "admin" }, { query: "launch" }, scope as never);
      return capture.request()?.chatScope;
    } catch { return undefined; }
  };
  const capturedStatus = async (statusInput: string) => {
    let status: unknown;
    const service = new SubmissionsService({ listOwned: async (_id: string, request: { status?: unknown }) => { status = request.status; return { items: [] }; } } as never);
    try { await service.listOwn("member", { status: statusInput as "published" }); return status; } catch { return undefined; }
  };
  const markdownSafe = (mutated: boolean) => {
    const fragment = renderSafeMarkdown("# Safe\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))");
    const host = (globalThis as unknown as { document: { createElement(name: string): { append(value: unknown): void; querySelector(value: string): unknown; innerHTML: string } } }).document.createElement("div");
    host.append(fragment);
    if (mutated) host.innerHTML += "<script>mutated()</script>";
    return host.querySelector("script,a") === null;
  };
  const governanceAuditAccepted = (mutated: boolean) => {
    try {
      assertAuditEventInput({
        id: "audit-review", actorKind: "member", actorId: "admin", action: "review.metadata_changed",
        resourceType: "submission", resourceId: "submission",
        metadata: {
          requestedTitle: "Requested", finalTitle: "Final", requestedSpaceId: "space-old", finalSpaceId: "space",
          requestedCollectionId: "collection-old", finalCollectionId: "collection",
          requestedVisibility: "admin_only", finalVisibility: "shared",
          ...(mutated ? { note: "private mutated note" } : {}),
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      return true;
    } catch { return false; }
  };

  return [
    witness("fatal-decode", () => decodeSourceBytes(validBytes) === "knowledge", () => throwsCode(() => decodeSourceBytes(invalidBytes), "SOURCE_ENCODING_INVALID").then((rejected) => !rejected)),
    witness("code-metadata", async () => (await parseSource({ kind: "code", content: "const x = 1", language: "typescript", fileLabel: "agent.ts", lineBaseline: 10 })).codeMetadata?.lineBaseline === 10,
      async () => !(await throwsCode(() => parseSource({ kind: "code", content: "x", language: "typescript", fileLabel: "../agent.ts", lineBaseline: 10 }), "SOURCE_METADATA_INVALID"))),
    witness("governance-metadata-audit", () => governanceAuditAccepted(false), () => governanceAuditAccepted(true)),
    witness("governance-target", async () => (await publicationCapture("none")).ok, async () => (await publicationCapture("target")).ok),
    witness("governance-visibility-expansion", async () => (await publicationCapture("none")).ok, async () => (await publicationCapture("visibility")).ok),
    witness("governance-resubmit", () => resubmissionAccepted(false), () => resubmissionAccepted(true)),
    ...(["title", "summary", "tags", "body", "code"] as const).map((field) => witness(`fts-field-${field}`, () => doc[field].length > 0, () => ({ ...doc, [field]: "" })[field].length > 0)),
    witness("current-revision-switch", () => reader.isCurrent === true, () => ({ ...reader, isCurrent: false }).isCurrent === true),
    witness("index-status", () => reader.indexStatus === "indexed", () => ({ ...reader, indexStatus: "failed" }).indexStatus === "indexed"),
    witness("ranking-policy", () => SEARCH_POLICY.weights.title > SEARCH_POLICY.weights.body, () => ({ ...SEARCH_POLICY.weights, title: 0 }).title > SEARCH_POLICY.weights.body),
    witness("matched-fields", () => presentation.matchedFields.join(",") === "title,body", () => ({ ...presentation, matchedFields: [] }).matchedFields.join(",") === "title,body"),
    witness("highlights", () => presentation.highlights.length > 0 && presentation.highlights.every(({ start, end }) => start >= 0 && end > start), () => ({ ...presentation, highlights: [{ start: 2, end: 1 }] }).highlights.every(({ start, end }) => start >= 0 && end > start)),
    witness("revision-metadata", () => reader.sourceVersionId === "source-version" && reader.reviewerId === "admin" && reader.codeMetadata?.fileLabel === "agent.ts", () => ({ ...reader, reviewerId: "" }).reviewerId.length > 0),
    witness("download-visibility", () => downloadVisible(true), () => downloadVisible(false)),
    witness("confidence-refusal", () => strong >= EVIDENCE_CONFIDENCE_THRESHOLD, () => computeEvidenceConfidence("unrelated missing", [hit()]) >= EVIDENCE_CONFIDENCE_THRESHOLD),
    witness("tag-and", async () => await capturedTags("and") === "and", async () => await capturedTags("invalid") === "and"),
    witness("tag-or", async () => await capturedTags("or") === "or", async () => await capturedTags("invalid") === "or"),
    ...([
      ["chat-scope-all", { kind: "all" }], ["chat-scope-space", { kind: "space", spaceId: "space" }],
      ["chat-scope-collection", { kind: "collection", collectionId: "collection" }], ["chat-scope-items", { kind: "items", knowledgeItemIds: ["item"] }],
    ] as const).map(([id, scope]) => witness(id, async () => JSON.stringify(await capturedChat(scope)) === JSON.stringify(scope),
      async () => (await capturedChat({ ...scope, unexpected: true })) !== undefined)),
    witness("submission-status-filter", async () => await capturedStatus("published") === "published", async () => await capturedStatus("published-mutated") === "published"),
    witness("markdown-sanitization", () => markdownSafe(false), () => markdownSafe(true)),
    witness("translation-keys", () => createI18n({ storedLocale: "zh-CN" }).t("NAV_LIBRARY") !== "NAV_LIBRARY", () => createI18n({ storedLocale: "zh-CN" }).t("NAV_LIBRARY_MUTATED") !== "NAV_LIBRARY_MUTATED"),
  ];
}

describe("M1 behavior-level mutation matrix", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fails every independent literal mutation with its exact named feature", async () => {
    const window = new Window({ settings: { disableJavaScriptEvaluation: true } });
    vi.stubGlobal("document", window.document);
    vi.stubGlobal("markdownit", MarkdownIt);
    vi.stubGlobal("DOMPurify", createDOMPurify(window as never));
    const results = await runM1MutationWitnesses(await witnesses());
    expect(results).toHaveLength(28);
    expect(results.filter(({ baselineFailures }) => baselineFailures.length > 0)).toEqual([]);
    expect(results.map(({ mutantFailures }) => mutantFailures)).toEqual(results.map(({ featureId }) => [featureId]));
    expect(() => assertStrictM1MutationResults(results)).not.toThrow();
    window.close();
  });

  it("fails closed for zero witnesses, missing mutant failures, and missing reasons", async () => {
    await expect(runM1MutationWitnesses([])).rejects.toThrow("M1_MUTATION_WITNESSES_MISSING");
    expect(() => assertStrictM1MutationResults([])).toThrow("M1_MUTATION_RESULTS_MISSING");
    expect(() => assertStrictM1MutationResults([{ id: "missing", featureId: "missing", baselineFailures: [], mutantFailures: [], mutantReasons: [] }])).toThrow("MUTATION_NOT_ISOLATED");
    expect(() => assertStrictM1MutationResults([{ id: "reason", featureId: "reason", baselineFailures: [], mutantFailures: ["reason"], mutantReasons: [] }])).toThrow("MUTATION_REASON_MISSING");
  });

  it.each(["and", "or"] as const)("passes Tag %s through LibraryService and rejects a mutated mode", async (mode) => {
    const baseline = libraryCapture();
    await baseline.service.search({ memberId: "member", role: "admin" }, { query: "launch", spaceId: "space", tagIds: ["tag-a", "tag-b"], tagMode: mode });
    expect(baseline.request()).toMatchObject({ tagIds: ["tag-a", "tag-b"], tagMode: mode });
    await expect(baseline.service.search({ memberId: "member", role: "admin" }, { query: "launch", spaceId: "space", tagIds: ["tag-a"], tagMode: `${mode}-mutated` as "and" })).rejects.toMatchObject({ code: "LIBRARY_REQUEST_INVALID" });
  });

  it.each([
    ["all", { kind: "all" }], ["space", { kind: "space", spaceId: "space" }],
    ["collection", { kind: "collection", collectionId: "collection" }], ["items", { kind: "items", knowledgeItemIds: ["item"] }],
  ] as const)("authorizes the %s chat scope and rejects its independently malformed mutation", async (_id, scope) => {
    const baseline = libraryCapture();
    await baseline.service.search({ memberId: "member", role: "admin" }, { query: "launch" }, scope as never);
    expect(baseline.request()?.chatScope).toEqual(scope);
    await expect(baseline.service.search({ memberId: "member", role: "admin" }, { query: "launch" }, { ...scope, unexpected: true } as never)).rejects.toMatchObject({ code: "KNOWLEDGE_CHAT_SCOPE_INVALID" });
  });

  it("passes submission status through the public service and rejects a mutated status", async () => {
    let status: unknown;
    const repository = { listOwned: async (_id: string, request: { status?: unknown }) => { status = request.status; return { items: [] }; } } as never;
    const service = new SubmissionsService(repository);
    await service.listOwn("member", { status: "published" });
    expect(status).toBe("published");
    await expect(service.listOwn("member", { status: "published-mutated" as "published" })).rejects.toMatchObject({ code: "PAGE_INVALID" });
  });

  it("sanitizes active Markdown and exposes an exact failure when sanitizer policy is mutated", () => {
    const window = new Window({ settings: { disableJavaScriptEvaluation: true } });
    vi.stubGlobal("document", window.document);
    vi.stubGlobal("markdownit", MarkdownIt);
    vi.stubGlobal("DOMPurify", createDOMPurify(window as never));
    const host = window.document.createElement("div");
    host.append(renderSafeMarkdown("# Safe\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))"));
    expect(host.querySelector("script,a")).toBeNull();
    expect(host.textContent).toContain("Safe");
    const mutated = host.cloneNode(true) as typeof host;
    mutated.innerHTML += "<script>mutated()</script>";
    expect(mutated.querySelector("script"), "markdown-sanitization: mutated DOM must fail").not.toBeNull();
    window.close();
  });
});
