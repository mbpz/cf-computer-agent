/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { getWorkspace, type WorkspaceClient } from "@cloudflare/computer";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CitedAnswerService,
  type CitedAnswerAi,
  type CitedAnswerAiInput,
} from "../../src/ai/cited-answer-service";
import { AppError } from "../../src/http";
import type { KnowledgeBase } from "../../src/index";
import { createPublishedContentReader } from "../../src/knowledge/published-content";
import type { PublishedContentReader, PublishedContentReceipt, RpcResult } from "../../src/knowledge/types";
import { LibraryRepository } from "../../src/library/repository";
import { encodeCitationId, LibraryService } from "../../src/library/service";
import type { LibraryScope } from "../../src/library/types";
import { MIGRATIONS } from "../fixtures/d1";

const contributor: LibraryScope = { memberId: "member-1", role: "contributor" };
const admin: LibraryScope = { memberId: "admin-1", role: "admin" };
const disabled: LibraryScope = { memberId: "member-disabled", role: "contributor" };

describe("M1 permission-scoped library", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedPrincipalsAndSpaces();
  });

  it("lists only current visible active knowledge in the requested Space with gap-free keyset pages", async () => {
    await seedKnowledge({ id: "knowledge-a", revisionId: "revision-a", title: "A shared", visibility: "shared" });
    await seedKnowledge({ id: "knowledge-b", revisionId: "revision-b", title: "B shared", visibility: "shared" });
    await seedKnowledge({ id: "knowledge-admin", revisionId: "revision-admin", title: "Admin", visibility: "admin_only" });
    await seedKnowledge({ id: "knowledge-trashed", revisionId: "revision-trashed", title: "Trashed", visibility: "shared", status: "trashed" });
    await seedKnowledge({ id: "knowledge-other-space", revisionId: "revision-other-space", title: "Other", visibility: "shared", spaceId: "space-two" });
    const service = serviceWithContent();

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(contributor, { spaceId: "default", limit: 1, cursor });
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(seen).toEqual(["knowledge-b", "knowledge-a"]);
    expect(new Set(seen).size).toBe(seen.length);
    await expect(service.list(admin, { spaceId: "default", limit: 20 })).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: "knowledge-b", visibility: "shared", revisionId: "revision-b" }),
        expect.objectContaining({ id: "knowledge-admin", visibility: "admin_only", revisionId: "revision-admin" }),
        expect.objectContaining({ id: "knowledge-a", visibility: "shared", revisionId: "revision-a" }),
      ],
    });
    await expect(service.list(contributor, { spaceId: "space-two", limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "knowledge-other-space" })],
    });
    await expect(service.list(disabled, { limit: 20 })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("cross-checks the D1 member role instead of trusting a caller-claimed admin role", async () => {
    await seedKnowledge({ id: "knowledge-admin", revisionId: "revision-admin", title: "Admin", visibility: "admin_only" });
    const forged: LibraryScope = { memberId: "member-1", role: "admin" };
    const service = serviceWithContent();

    await expect(service.list(forged, { limit: 20 })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(service.detail(forged, "knowledge-admin")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("authorizes the stored D1 path and hash before reader access and hides invisible existence", async () => {
    await seedKnowledge({ id: "knowledge-shared", revisionId: "revision-shared", title: "Shared", visibility: "shared", markdown: "# Shared\n" });
    await seedKnowledge({ id: "knowledge-admin", revisionId: "revision-admin", title: "Admin", visibility: "admin_only", markdown: "# Admin\n" });
    const reads: Array<[string, string]> = [];
    const service = serviceWithContent(reads);

    await expect(service.detail(contributor, "knowledge-shared")).resolves.toMatchObject({
      id: "knowledge-shared",
      currentRevision: { id: "revision-shared", markdown: "# Shared\n" },
    });
    expect(reads).toEqual([[
      "/workspace/published/default/knowledge-shared/revision-shared.md",
      hashFor("revision-shared"),
    ]]);

    await expect(service.detail(contributor, "knowledge-admin")).rejects.toMatchObject({
      code: "KNOWLEDGE_NOT_FOUND", status: 404,
    });
    await expect(service.detail(contributor, "does-not-exist")).rejects.toMatchObject({
      code: "KNOWLEDGE_NOT_FOUND", status: 404,
    });
    expect(reads).toHaveLength(1);
  });

  it("reads a visible historical revision but never silently substitutes the current one", async () => {
    await seedKnowledge({
      id: "knowledge-history",
      revisionId: "revision-old",
      title: "Old admin",
      visibility: "admin_only",
      markdown: "# Old admin\n",
    });
    await addCurrentRevision({
      knowledgeItemId: "knowledge-history",
      revisionId: "revision-current",
      title: "Current shared",
      visibility: "shared",
      markdown: "# Current shared\n",
    });
    const service = serviceWithContent();

    await expect(service.detail(contributor, "knowledge-history")).resolves.toMatchObject({
      currentRevision: { id: "revision-current", markdown: "# Current shared\n", isCurrent: true },
    });
    await expect(service.revision(contributor, "knowledge-history", "revision-old"))
      .rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND", status: 404 });
    await expect(service.revision(admin, "knowledge-history", "revision-old")).resolves.toMatchObject({
      id: "revision-old", markdown: "# Old admin\n", isCurrent: false,
    });
  });

  it("keeps a still-visible historical citation readable and makes hidden, inactive, and absent citations indistinguishable", async () => {
    await seedKnowledge({
      id: "knowledge-old-citation",
      revisionId: "revision-old-citation",
      title: "Old citation",
      visibility: "shared",
      body: "Historical citation body",
    });
    await addCurrentRevision({
      knowledgeItemId: "knowledge-old-citation",
      revisionId: "revision-new-citation",
      title: "New citation",
      visibility: "shared",
      body: "Current citation body",
    });
    await seedKnowledge({
      id: "knowledge-hidden-citation",
      revisionId: "revision-hidden-citation",
      title: "Hidden citation",
      visibility: "admin_only",
      body: "Hidden citation body",
    });
    await seedKnowledge({
      id: "knowledge-inactive-citation",
      revisionId: "revision-inactive-citation",
      title: "Inactive citation",
      visibility: "shared",
      spaceId: "space-two",
      body: "Inactive citation body",
    });
    await seedKnowledge({
      id: "knowledge-trashed-citation",
      revisionId: "revision-trashed-citation",
      title: "Trashed citation",
      visibility: "shared",
      status: "trashed",
      body: "Trashed citation body",
    });
    await env.DB.prepare("UPDATE spaces SET status = 'disabled' WHERE id = 'space-two'").run();
    const service = serviceWithContent();
    const oldCitation = encodeCitationId({
      revisionId: "revision-old-citation",
      chunkId: "revision-old-citation-chunk-0",
    });

    await expect(service.readCitation(contributor, oldCitation)).resolves.toEqual({
      citationId: oldCitation,
      knowledgeItemId: "knowledge-old-citation",
      revisionId: "revision-old-citation",
      chunkId: "revision-old-citation-chunk-0",
      title: "Old citation",
      headingPath: ["Section"],
      startLine: 3,
      endLine: 3,
      body: "Historical citation body",
      publishedAt: now,
    });

    const denied = await Promise.all([
      encodeCitationId({
        revisionId: "revision-hidden-citation",
        chunkId: "revision-hidden-citation-chunk-0",
      }),
      encodeCitationId({
        revisionId: "revision-inactive-citation",
        chunkId: "revision-inactive-citation-chunk-0",
      }),
      encodeCitationId({
        revisionId: "revision-trashed-citation",
        chunkId: "revision-trashed-citation-chunk-0",
      }),
      encodeCitationId({ revisionId: "revision-absent", chunkId: "revision-absent-chunk-0" }),
    ].map((citationId) => rejectedAppError(service.readCitation(contributor, citationId))));
    expect(denied).toEqual([
      { code: "KNOWLEDGE_NOT_FOUND", message: "Knowledge was not found", status: 404 },
      { code: "KNOWLEDGE_NOT_FOUND", message: "Knowledge was not found", status: 404 },
      { code: "KNOWLEDGE_NOT_FOUND", message: "Knowledge was not found", status: 404 },
      { code: "KNOWLEDGE_NOT_FOUND", message: "Knowledge was not found", status: 404 },
    ]);
  });

  it("searches Chinese bigrams and code identifiers while applying visibility and current-revision filters", async () => {
    await seedKnowledge({
      id: "knowledge-chinese",
      revisionId: "revision-chinese",
      title: "治理手册",
      visibility: "shared",
      body: "团队权限治理手册",
      searchBody: "团队权限治理手册 团队 队权 权限 限治 治理 理手 手册",
    });
    await seedKnowledge({
      id: "knowledge-code",
      revisionId: "revision-code",
      title: "Code",
      visibility: "shared",
      body: "const getUserByID = () => 42;",
      searchBody: "const getuserbyid _ 42",
    });
    await seedKnowledge({
      id: "knowledge-secret",
      revisionId: "revision-secret",
      title: "Secret",
      visibility: "admin_only",
      body: "权限治理 admin secret",
      searchBody: "权限治理 权限 限治 治理 admin secret",
    });
    await seedKnowledge({
      id: "knowledge-history-search",
      revisionId: "revision-history-old",
      title: "Old searchable",
      visibility: "shared",
      body: "obsolete_unique_token",
      searchBody: "obsolete_unique_token",
    });
    await addCurrentRevision({
      knowledgeItemId: "knowledge-history-search",
      revisionId: "revision-history-current",
      title: "Current",
      visibility: "shared",
      body: "current token",
      searchBody: "current token",
    });
    const service = serviceWithContent();

    await expect(service.search(contributor, { query: "权限 治理", limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ knowledgeItemId: "knowledge-chinese", revisionId: "revision-chinese" })],
      degraded: false,
    });
    await expect(service.search(admin, { query: "权限 治理", limit: 20 })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ knowledgeItemId: "knowledge-chinese" }),
        expect.objectContaining({ knowledgeItemId: "knowledge-secret" }),
      ]),
    });
    await expect(service.search(contributor, { query: "getUserByID", limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ knowledgeItemId: "knowledge-code" })],
    });
    await expect(service.search(contributor, { query: "obsolete_unique_token", limit: 20 })).resolves.toMatchObject({
      items: [],
    });
  });

  it("centers excerpts on exact lexical tokens instead of prefixed substrings", async () => {
    await seedKnowledge({
      id: "knowledge-substring-only",
      revisionId: "revision-substring-only",
      title: "Substring-only handbook",
      visibility: "shared",
      body: "prelaunch postlatency cannot satisfy exact search tokens",
      searchBody: "prelaunch postlatency cannot satisfy exact search tokens",
    });
    await seedKnowledge({
      id: "knowledge-excerpt-token-boundary",
      revisionId: "revision-excerpt-token-boundary",
      title: "Token boundary handbook",
      visibility: "shared",
      body: `prelaunch postlatency ${"unrelated filler ".repeat(40)}launch latency resolved`,
      searchBody: `prelaunch postlatency ${"unrelated filler ".repeat(40)}launch latency resolved`,
    });
    const service = serviceWithContent();

    const page = await service.search(contributor, { query: "launch latency", limit: 20 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.knowledgeItemId).toBe("knowledge-excerpt-token-boundary");
    expect(page.items[0]!.excerpt).toContain("launch latency resolved");
    expect(page.items[0]!.excerpt).not.toContain("prelaunch postlatency");

    const stuffed = await service.search(contributor, {
      query: "prelaunch postlatency launch latency",
      limit: 20,
    });
    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<never> {
        this.calls += 1;
        throw new Error("query stuffing must not elevate partial bounded evidence");
      },
    };
    await expect(new CitedAnswerService(ai).answer(
      contributor,
      "prelaunch postlatency launch latency",
      stuffed.items,
    )).resolves.toEqual({
      answer: "知识库中没有足够依据回答这个问题。",
      citations: [],
      sources: [],
    });
    expect(ai.calls).toBe(0);
  });

  it("shares underscore, case, and NFKC token semantics from D1 search through cited answers", async () => {
    await seedKnowledge({
      id: "knowledge-foo-bar",
      revisionId: "revision-foo-bar",
      title: "Foo bar guide",
      visibility: "shared",
      body: "foo bar rollout requires review",
      searchBody: "foo bar rollout requires review",
    });
    const library = serviceWithContent();

    const ascii = await library.search(contributor, { query: "foo_bar", limit: 20 });
    const compatibility = await library.search(contributor, { query: "ＦＯＯ_ＢＡＲ", limit: 20 });

    expect(ascii.items).toHaveLength(1);
    expect(compatibility.items).toEqual(ascii.items);
    const hit = compatibility.items[0]!;
    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The foo bar rollout requires review.", citationIds: [hit.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };

    await expect(new CitedAnswerService(ai).answer(contributor, "ＦＯＯ_ＢＡＲ", compatibility.items))
      .resolves.toMatchObject({
        answer: "The foo bar rollout requires review. [1]",
        citations: [hit.citationId],
      });
    expect(ai.calls).toBe(1);
  });

  it("matches Greek final-sigma variants consistently across D1 excerpts and cited answers", async () => {
    await seedKnowledge({
      id: "knowledge-greek-sigma",
      revisionId: "revision-greek-sigma",
      title: "Greek case-folding handbook",
      visibility: "shared",
      body: `${"unrelated preface ".repeat(40)}ΟΣ verified control`,
      searchBody: `${"unrelated preface ".repeat(40)}ΟΣ verified control`,
    });
    const library = serviceWithContent();

    const pages = await Promise.all(["ΟΣ", "ος", "οσ"].map((query) => (
      library.search(contributor, { query, limit: 20 })
    )));

    for (const page of pages) {
      expect(page.items).toHaveLength(1);
      expect(page.items[0]!.excerpt).toContain("ΟΣ verified control");
    }
    const hit = pages[2]!.items[0]!;
    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The sigma control is verified.", citationIds: [hit.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };

    await expect(new CitedAnswerService(ai).answer(contributor, "οσ", [hit]))
      .resolves.toMatchObject({
        answer: "The sigma control is verified. [1]",
        citations: [hit.citationId],
      });
    expect(ai.calls).toBe(1);
  });

  it("preserves D1 sharp-s case equivalence without inventing an SS expansion match", async () => {
    await seedKnowledge({
      id: "knowledge-sharp-s",
      revisionId: "revision-sharp-s",
      title: "German case-folding handbook",
      visibility: "shared",
      body: `${"unrelated preface ".repeat(40)}Straße verified control`,
      searchBody: `${"unrelated preface ".repeat(40)}Straße verified control`,
    });
    const library = serviceWithContent();

    const lower = await library.search(contributor, { query: "straße", limit: 20 });
    const capitalSharp = await library.search(contributor, { query: "STRAẞE", limit: 20 });
    const expanded = await library.search(contributor, { query: "STRASSE", limit: 20 });

    expect(lower.items).toHaveLength(1);
    expect(capitalSharp.items).toEqual(lower.items);
    expect(lower.items[0]!.excerpt).toContain("Straße verified control");
    expect(expanded.items).toEqual([]);

    const hit = capitalSharp.items[0]!;
    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The Straße control is verified.", citationIds: [hit.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    await expect(new CitedAnswerService(ai).answer(contributor, "STRAẞE", [hit]))
      .resolves.toMatchObject({
        answer: "The Straße control is verified. [1]",
        citations: [hit.citationId],
      });
    expect(ai.calls).toBe(1);
  });

  it("answers only from contributor-authorized current search hits and rejects a hidden citation", async () => {
    for (let index = 0; index < 6; index += 1) {
      await seedKnowledge({
        id: `knowledge-answer-decoy-${index}`,
        revisionId: `revision-answer-decoy-${index}`,
        title: `Unrelated answer decoy ${index}`,
        visibility: "shared",
        body: "vacation policy directory contact details",
        searchBody: "vacation policy directory contact details",
      });
    }
    await seedKnowledge({
      id: "knowledge-answer-shared",
      revisionId: "revision-answer-shared",
      title: "Shared answer",
      visibility: "shared",
      body: "trustedanswer current shared evidence",
      searchBody: "trustedanswer current shared evidence",
    });
    await seedKnowledge({
      id: "knowledge-answer-secret",
      revisionId: "revision-answer-secret",
      title: "Secret answer",
      visibility: "admin_only",
      body: "trustedanswer admin_only hidden evidence",
      searchBody: "trustedanswer admin_only hidden evidence",
    });
    const library = serviceWithContent();
    const page = await library.search(contributor, { query: "trustedanswer", limit: 20 });
    const sharedHit = page.items[0]!;
    const hiddenCitation = encodeCitationId({
      revisionId: "revision-answer-secret",
      chunkId: "revision-answer-secret-chunk-0",
    });
    const inputs: CitedAnswerAiInput[] = [];
    let citationId = sharedHit.citationId;
    const ai: CitedAnswerAi = {
      async run(_model, input): Promise<unknown> {
        inputs.push(input);
        return { response: JSON.stringify({
          claims: [{ text: "Current shared evidence.", citationIds: [citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    const answers = new CitedAnswerService(ai);

    expect(page.items).toHaveLength(1);
    expect(sharedHit).toMatchObject({
      knowledgeItemId: "knowledge-answer-shared",
      revisionId: "revision-answer-shared",
    });
    await expect(answers.answer(contributor, "trustedanswer", page.items)).resolves.toEqual({
      answer: "Current shared evidence. [1]",
      citations: [sharedHit.citationId],
      sources: [sharedHit],
    });
    const context = JSON.parse(inputs[0]!.messages[1]!.content.split("输入 JSON：\n")[1]!) as {
      sources: Array<{ citationId: string; excerpt: string }>;
    };
    expect(context.sources).toEqual([expect.objectContaining({
      citationId: sharedHit.citationId,
      excerpt: expect.stringContaining("shared evidence"),
    })]);
    expect(JSON.stringify(context)).not.toContain("admin_only hidden evidence");
    expect(JSON.stringify(context)).not.toContain(hiddenCitation);

    citationId = hiddenCitation;
    await expect(answers.answer(contributor, "trustedanswer", page.items)).rejects.toMatchObject({
      code: "ANSWER_UNGROUNDED",
      status: 422,
    });
  });

  it("accepts strong English evidence with real tiny-corpus FTS5 scores", async () => {
    await seedKnowledge({
      id: "knowledge-tiny-english",
      revisionId: "revision-tiny-english",
      title: "Launch latency review",
      visibility: "shared",
      body: "Launch latency was caused by a compressed test window.",
      searchBody: "launch latency compressed test window",
    });
    const library = serviceWithContent();
    const page = await library.search(contributor, { query: "launch latency", limit: 20 });
    const hit = page.items[0]!;

    expect(page.items).toHaveLength(1);
    expect(hit.score).toBeLessThan(0);
    expect(Math.abs(hit.score)).toBeLessThan(0.001);

    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The compressed test window caused launch latency.", citationIds: [hit.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    await expect(new CitedAnswerService(ai).answer(contributor, "launch latency", [hit]))
      .resolves.toMatchObject({
        answer: "The compressed test window caused launch latency. [1]",
        citations: [hit.citationId],
      });
    expect(ai.calls).toBe(1);
  });

  it("accepts strong Han evidence with real tiny-corpus FTS5 scores", async () => {
    await seedKnowledge({
      id: "knowledge-tiny-han",
      revisionId: "revision-tiny-han",
      title: "权限治理手册",
      visibility: "shared",
      body: "权限治理 权限 限治 治理需要双人复核。",
      searchBody: "权限治理 权限 限治 治理 双人复核",
    });
    const library = serviceWithContent();
    const page = await library.search(contributor, { query: "权限治理", limit: 20 });
    const hit = page.items[0]!;

    expect(page.items).toHaveLength(1);
    expect(hit.score).toBeLessThan(0);
    expect(Math.abs(hit.score)).toBeLessThan(0.001);

    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "权限治理需要双人复核。", citationIds: [hit.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    await expect(new CitedAnswerService(ai).answer(contributor, "权限治理", [hit]))
      .resolves.toMatchObject({
        answer: "权限治理需要双人复核。 [1]",
        citations: [hit.citationId],
      });
    expect(ai.calls).toBe(1);
  });

  it("keeps visible-evidence relevance invariant under unrelated corpus growth and padded input", async () => {
    await seedKnowledge({
      id: "knowledge-growth-strong",
      revisionId: "revision-growth-strong",
      title: "Launch latency review",
      visibility: "shared",
      body: "Launch latency was caused by a compressed test window.",
      searchBody: "launch latency compressed test window",
    });
    await seedKnowledge({
      id: "knowledge-growth-weak",
      revisionId: "revision-growth-weak",
      title: "General employee handbook",
      visibility: "shared",
      body: `launch ${"generic boilerplate policy ".repeat(400)}latency`,
      searchBody: `launch ${"generic boilerplate policy ".repeat(400)}latency`,
    });
    const library = serviceWithContent();
    const before = await library.search(contributor, { query: "   launch latency   ", limit: 20 });
    const strongBefore = before.items.find((hit) => hit.knowledgeItemId === "knowledge-growth-strong")!;
    const weakBefore = before.items.find((hit) => hit.knowledgeItemId === "knowledge-growth-weak")!;

    expect(strongBefore.score).toBeLessThan(0);
    expect(weakBefore.score).toBeLessThan(0);
    expect(weakBefore.excerpt).toMatch(/^…|…$/u);
    expect(["launch", "latency"].every((term) => (
      `${weakBefore.title}\n${weakBefore.excerpt}`.toLowerCase().includes(term)
    ))).toBe(false);

    const strongAi: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The compressed test window caused launch latency.", citationIds: [strongBefore.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    await expect(new CitedAnswerService(strongAi).answer(
      contributor,
      "   launch latency   ",
      [strongBefore],
    )).resolves.toMatchObject({ citations: [strongBefore.citationId] });
    expect(strongAi.calls).toBe(1);

    const weakAi: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<never> {
        this.calls += 1;
        throw new Error("weak evidence must not reach AI");
      },
    };
    const weakAnswers = new CitedAnswerService(weakAi);
    await expect(weakAnswers.answer(contributor, "   launch latency   ", [weakBefore])).resolves.toEqual({
      answer: "知识库中没有足够依据回答这个问题。",
      citations: [],
      sources: [],
    });
    expect(weakAi.calls).toBe(0);

    for (let index = 0; index < 24; index += 1) {
      await seedKnowledge({
        id: `knowledge-growth-decoy-${index}`,
        revisionId: `revision-growth-decoy-${index}`,
        title: `Unrelated handbook ${index}`,
        visibility: "shared",
        body: "vacation policy directory contact details",
        searchBody: "vacation policy directory contact details",
      });
    }
    const after = await library.search(contributor, { query: "launch latency", limit: 20 });
    const strongAfter = after.items.find((hit) => hit.knowledgeItemId === "knowledge-growth-strong")!;
    const weakAfter = after.items.find((hit) => hit.knowledgeItemId === "knowledge-growth-weak")!;
    expect(strongAfter.score).not.toBe(strongBefore.score);
    expect(weakAfter.score).not.toBe(weakBefore.score);

    const grownStrongAi: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The compressed test window caused launch latency.", citationIds: [strongAfter.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    await expect(new CitedAnswerService(grownStrongAi).answer(
      contributor,
      "launch latency",
      [strongAfter],
    )).resolves.toMatchObject({ citations: [strongAfter.citationId] });
    expect(grownStrongAi.calls).toBe(1);

    await expect(weakAnswers.answer(contributor, "launch latency", [weakAfter])).resolves.toEqual({
      answer: "知识库中没有足够依据回答这个问题。",
      citations: [],
      sources: [],
    });
    expect(weakAi.calls).toBe(0);
  });

  it("uses stable rank/time/chunk keysets with no gaps or duplicates", async () => {
    await seedKnowledge({ id: "knowledge-a", revisionId: "revision-a", title: "Same", visibility: "shared", body: "stableterm", searchBody: "stableterm" });
    await seedKnowledge({ id: "knowledge-b", revisionId: "revision-b", title: "Same", visibility: "shared", body: "stableterm", searchBody: "stableterm" });
    await seedKnowledge({ id: "knowledge-c", revisionId: "revision-c", title: "Same", visibility: "shared", body: "stableterm", searchBody: "stableterm" });
    const service = serviceWithContent();
    const seen: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await service.search(contributor, { query: "stableterm", limit: 1, cursor });
      seen.push(...page.items.map((item) => item.chunkId));
      cursor = page.nextCursor;
    } while (cursor);

    expect(seen).toEqual(["revision-a-chunk-0", "revision-b-chunk-0", "revision-c-chunk-0"]);
    expect(new Set(seen).size).toBe(3);
  });

  it("reports only authorized search degradation and keeps degraded knowledge readable", async () => {
    await seedKnowledge({
      id: "knowledge-degraded",
      revisionId: "revision-degraded",
      title: "Readable degraded",
      visibility: "shared",
      searchStatus: "search_degraded",
      markdown: "# Still readable\n",
      index: false,
    });
    await seedKnowledge({
      id: "knowledge-secret-degraded",
      revisionId: "revision-secret-degraded",
      title: "Secret degraded",
      visibility: "admin_only",
      searchStatus: "search_degraded",
      index: false,
    });
    const service = serviceWithContent();

    await expect(service.search(contributor, { query: "readable", limit: 20 })).resolves.toEqual({
      items: [],
      degraded: true,
    });
    await expect(service.detail(contributor, "knowledge-degraded")).resolves.toMatchObject({
      searchStatus: "search_degraded",
      currentRevision: { markdown: "# Still readable\n" },
    });

    await env.DB.prepare("UPDATE knowledge_items SET search_status = 'indexed' WHERE id = 'knowledge-degraded'").run();
    await expect(service.search(contributor, { query: "readable", limit: 20 })).resolves.toEqual({
      items: [],
      degraded: false,
    });
    await expect(service.search(admin, { query: "readable", limit: 20 })).resolves.toMatchObject({ degraded: true });
  });

  it("returns inert bounded excerpts and reauthorizes current citations without leaking old chunks", async () => {
    await seedKnowledge({
      id: "knowledge-citation",
      revisionId: "revision-citation",
      title: "Citation",
      visibility: "shared",
      body: "<script>alert(1)</script> safe citation body ".repeat(20),
      searchBody: "script alert safe citation body",
    });
    const service = serviceWithContent();
    const page = await service.search(contributor, { query: "safe", limit: 20 });
    const hit = page.items[0]!;

    expect([...hit.excerpt].length).toBeLessThanOrEqual(241);
    expect(hit.excerpt).not.toMatch(/<mark>|<b>/i);
    await expect(service.readCitation(contributor, hit.citationId)).resolves.toMatchObject({
      citationId: hit.citationId,
      revisionId: "revision-citation",
      chunkId: "revision-citation-chunk-0",
      body: expect.stringContaining("safe citation body"),
    });

    const oldCitation = encodeCitationId({
      revisionId: "revision-history-old",
      chunkId: "revision-history-old-chunk-0",
    });
    await expect(service.readCitation(contributor, oldCitation)).rejects.toMatchObject({
      code: "KNOWLEDGE_NOT_FOUND", status: 404,
    });
  });

  it("rejects malformed or scope-mismatched cursors instead of falling back to an unbounded scan", async () => {
    await seedKnowledge({ id: "knowledge-a", revisionId: "revision-a", title: "A", visibility: "shared", body: "cursor", searchBody: "cursor" });
    await seedKnowledge({ id: "knowledge-b", revisionId: "revision-b", title: "B", visibility: "shared", body: "cursor", searchBody: "cursor" });
    const service = serviceWithContent();
    const listCursor = (await service.list(contributor, { spaceId: "default", limit: 1 })).nextCursor!;
    const searchCursor = (await service.search(contributor, { query: "cursor", limit: 1 })).nextCursor!;

    await expect(service.list(contributor, { spaceId: "space-two", limit: 1, cursor: listCursor }))
      .rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
    await expect(service.search(contributor, { query: "different", limit: 1, cursor: searchCursor }))
      .rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
    await expect(service.search(contributor, { query: "cursor", limit: 1, cursor: `${searchCursor}x` }))
      .rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
  });

  it("uses selective indexes for an empty Space page and an empty degraded scan at scale shape", async () => {
    await env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 500
       )
       INSERT INTO knowledge_items (
         id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at
       )
       SELECT printf('decoy-%04d', value), 'default', NULL, NULL, 'active', 'indexed', ?, ?
       FROM sequence`,
    ).bind(now, now).run();
    const prepared: string[] = [];
    const database = capturePreparedSql(env.DB, prepared);
    const service = new LibraryService(new LibraryRepository(database), noContentReader);

    await expect(service.list(contributor, { spaceId: "space-empty", limit: 20 }))
      .resolves.toEqual({ items: [] });
    await expect(service.search(contributor, { query: "not-present", spaceId: "space-empty", limit: 20 }))
      .resolves.toEqual({ items: [], degraded: false });

    const listSql = prepared.find((sql) => sql.includes("ORDER BY k.updated_at DESC"));
    const degradedSql = prepared.find((sql) => sql.includes("k.search_status = 'search_degraded'"));
    expect(listSql).toBeDefined();
    expect(degradedSql).toBeDefined();
    const listPlan = await explain(listSql!, ["member-1", "contributor", "space-empty", 21]);
    const degradedPlan = await explain(degradedSql!, ["member-1", "contributor", "space-empty"]);
    expect(listPlan).toContain("knowledge_items_space_page");
    expect(degradedPlan).toContain("knowledge_items_degraded_scope");
  });

  it("lets only D1-authorized stored path/hash values reach the real published-content reader", async () => {
    const sharedMarkdown = "# Canonical shared\n\nAuthorized bytes.\n";
    const sharedHash = await sha256Hex(sharedMarkdown);
    const secretMarkdown = "# Canonical secret\n\nHidden bytes.\n";
    const secretHash = await sha256Hex(secretMarkdown);
    await seedKnowledge({
      id: "knowledge-real-shared",
      revisionId: "revision-real-shared",
      title: "Real shared",
      visibility: "shared",
      markdown: sharedMarkdown,
      body: "Authorized citation body",
      searchBody: "authorized citation body",
      contentSha256: sharedHash,
    });
    await seedKnowledge({
      id: "knowledge-real-secret",
      revisionId: "revision-real-secret",
      title: "Real secret",
      visibility: "admin_only",
      markdown: secretMarkdown,
      body: "Secret citation body",
      searchBody: "secret citation body",
      contentSha256: secretHash,
    });
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("library-security:default"));
    await commitCanonical(stub, {
      spaceId: "default",
      knowledgeItemId: "knowledge-real-shared",
      revisionId: "revision-real-shared",
      contentSha256: sharedHash,
      markdown: sharedMarkdown,
    });
    await commitCanonical(stub, {
      spaceId: "default",
      knowledgeItemId: "knowledge-real-secret",
      revisionId: "revision-real-secret",
      contentSha256: secretHash,
      markdown: secretMarkdown,
    });
    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    const realReader = createPublishedContentReader(workspace);
    const readerCalls: Array<[string, string]> = [];
    const reader: PublishedContentReader = {
      async read(path, hash) {
        readerCalls.push([path, hash]);
        return realReader.read(path, hash);
      },
    };
    const repository = new LibraryRepository(env.DB);
    const service = new LibraryService(repository, reader);
    const sharedCitation = encodeCitationId({
      revisionId: "revision-real-shared",
      chunkId: "revision-real-shared-chunk-0",
    });
    const secretCitation = encodeCitationId({
      revisionId: "revision-real-secret",
      chunkId: "revision-real-secret-chunk-0",
    });

    try {
      const detailWithUntrustedExtras = service.detail.bind(service) as unknown as (
        scope: LibraryScope,
        knowledgeItemId: string,
        untrustedPath: string,
        untrustedHash: string,
      ) => ReturnType<LibraryService["detail"]>;
      await expect(detailWithUntrustedExtras(
        contributor,
        "knowledge-real-shared",
        "/workspace/published/default/knowledge-real-secret/revision-real-secret.md",
        secretHash,
      )).resolves.toMatchObject({
        currentRevision: { markdown: sharedMarkdown },
      });
      await expect(service.readCitation(contributor, sharedCitation)).resolves.toMatchObject({
        body: "Authorized citation body",
      });
      expect(readerCalls).toEqual([[
        "/workspace/published/default/knowledge-real-shared/revision-real-shared.md",
        sharedHash,
      ]]);

      const forged: LibraryScope = { memberId: "member-1", role: "admin" };
      await expect(service.detail(disabled, "knowledge-real-shared")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.revision(disabled, "knowledge-real-shared", "revision-real-shared")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.search(disabled, { query: "authorized", limit: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.readCitation(disabled, sharedCitation)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.detail(forged, "knowledge-real-secret")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.revision(forged, "knowledge-real-secret", "revision-real-secret")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.search(forged, { query: "secret", limit: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.readCitation(forged, secretCitation)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.detail(contributor, "knowledge-real-secret")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.revision(contributor, "knowledge-real-secret", "revision-real-secret")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.readCitation(contributor, secretCitation)).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.detail(contributor, "knowledge-invisible-id")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.revision(contributor, "knowledge-invisible-id", "revision-invisible-id")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.readCitation(contributor, encodeCitationId({
        revisionId: "revision-invisible-id",
        chunkId: "revision-invisible-id-chunk-0",
      }))).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });

      await expect(repository.findCurrent(forged, "knowledge-real-secret")).resolves.toBeNull();
      await expect(repository.findCurrent(contributor, "knowledge-real-secret")).resolves.toBeNull();
      await expect(repository.findRevision(disabled, "knowledge-real-shared", "revision-real-shared")).resolves.toBeNull();
      await expect(repository.findRevision(contributor, "knowledge-real-secret", "revision-real-secret")).resolves.toBeNull();
      await expect(repository.findCitation(contributor, "revision-real-secret", "revision-real-secret-chunk-0")).resolves.toBeNull();
      await expect(repository.list(forged, { limit: 20, cursorKey: "a".repeat(64) })).resolves.toEqual({ items: [] });
      await expect(repository.search(forged, {
        normalizedQuery: "secret",
        matchQuery: "\"secret\"",
        terms: ["secret"],
        termKeys: ["SECRET"],
        limit: 20,
        cursorKey: "a".repeat(64),
      })).resolves.toEqual({ items: [], degraded: false });
      expect(readerCalls).toHaveLength(1);

      await env.DB.prepare("UPDATE spaces SET status = 'disabled' WHERE id = 'default'").run();
      await expect(service.detail(contributor, "knowledge-real-shared")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.revision(contributor, "knowledge-real-shared", "revision-real-shared")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.search(contributor, { query: "authorized", limit: 20 })).resolves.toEqual({ items: [], degraded: false });
      await expect(service.readCitation(contributor, sharedCitation)).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      expect(readerCalls).toHaveLength(1);
    } finally {
      disposeWorkspace(workspace);
    }
  });
});

function serviceWithContent(reads: Array<[string, string]> = []): LibraryService {
  const reader: PublishedContentReader = {
    async read(path, hash) {
      reads.push([path, hash]);
      const row = await env.DB.prepare(
        "SELECT sv.content FROM revisions r JOIN source_versions sv ON sv.id = r.source_version_id WHERE r.normalized_path = ? AND r.content_sha256 = ? LIMIT 1",
      ).bind(path, hash).first<{ content: string }>();
      if (!row) throw new Error("published content not seeded");
      return row.content;
    },
  };
  return new LibraryService(new LibraryRepository(env.DB), reader);
}

async function seedPrincipalsAndSpaces(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('admin-1', 'github:admin', 'admin@example.test', 'admin', 'active', ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-1', 'github:member', 'member@example.test', 'contributor', 'active', ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-disabled', 'github:disabled', 'disabled@example.test', 'contributor', 'disabled', ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES ('space-two', 'space-two', 'Space Two', '', 'shared', 'active', 2, 0, ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES ('space-empty', 'space-empty', 'Space Empty', '', 'shared', 'active', 3, 0, ?, ?)").bind(now, now),
  ]);
}

interface SeedKnowledgeInput {
  id: string;
  revisionId: string;
  title: string;
  visibility: "shared" | "admin_only";
  spaceId?: string;
  status?: "active" | "trashed";
  searchStatus?: "indexed" | "search_degraded";
  markdown?: string;
  body?: string;
  searchBody?: string;
  index?: boolean;
  contentSha256?: string;
}

async function seedKnowledge(input: SeedKnowledgeInput): Promise<void> {
  const spaceId = input.spaceId ?? "default";
  const markdown = input.markdown ?? `# ${input.title}\n\n${input.body ?? input.title}\n`;
  const body = input.body ?? input.title;
  const searchBody = input.searchBody ?? body.toLowerCase();
  const submissionId = `submission-${input.revisionId}`;
  const sourceId = `source-${input.revisionId}`;
  const sourceVersionId = `source-version-${input.revisionId}`;
  const contentSha256 = input.contentSha256 ?? hashFor(input.revisionId);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at) VALUES (?, 'member-1', ?, NULL, 'markdown', 'published', ?, ?, NULL, ?, ?)",
    ).bind(submissionId, spaceId, input.title, markdown, now, now),
    env.DB.prepare(
      "INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES (?, 'member-1', ?, NULL, 'markdown', ?, ?, ?)",
    ).bind(sourceId, spaceId, input.title, now, now),
    env.DB.prepare(
      "INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, ?, ?, 'm1-v1', ?)",
    ).bind(sourceVersionId, sourceId, submissionId, markdown, contentSha256, now),
    env.DB.prepare(
      "INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)",
    ).bind(input.id, spaceId, input.status ?? "active", input.searchStatus ?? "indexed", now, now),
    env.DB.prepare(
      "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, '[]', ?, 'admin-1', ?)",
    ).bind(input.revisionId, input.id, sourceVersionId, `/workspace/published/${spaceId}/${input.id}/${input.revisionId}.md`, contentSha256, input.title, input.visibility, now),
    env.DB.prepare("UPDATE knowledge_items SET current_revision_id = ? WHERE id = ?").bind(input.revisionId, input.id),
    env.DB.prepare(
      "INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body) VALUES (?, ?, 0, '[\"Section\"]', 3, 3, ?, ?, '', ?)",
    ).bind(`${input.revisionId}-chunk-0`, input.revisionId, body, input.title, searchBody),
    ...(input.index === false ? [] : [env.DB.prepare(
      "INSERT INTO chunks_fts (chunk_id, title, tags, body) VALUES (?, ?, '', ?)",
    ).bind(`${input.revisionId}-chunk-0`, input.title, searchBody)]),
  ]);
}

async function addCurrentRevision(input: Omit<SeedKnowledgeInput, "id" | "spaceId" | "status" | "searchStatus"> & {
  knowledgeItemId: string;
}): Promise<void> {
  const item = await env.DB.prepare("SELECT space_id FROM knowledge_items WHERE id = ?")
    .bind(input.knowledgeItemId).first<{ space_id: string }>();
  if (!item) throw new Error("knowledge item missing");
  const markdown = input.markdown ?? `# ${input.title}\n\n${input.body ?? input.title}\n`;
  const body = input.body ?? input.title;
  const searchBody = input.searchBody ?? body.toLowerCase();
  const submissionId = `submission-${input.revisionId}`;
  const sourceId = `source-${input.revisionId}`;
  const sourceVersionId = `source-version-${input.revisionId}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at) VALUES (?, 'member-1', ?, NULL, 'markdown', 'published', ?, ?, NULL, ?, ?)",
    ).bind(submissionId, item.space_id, input.title, markdown, now, now),
    env.DB.prepare(
      "INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES (?, 'member-1', ?, NULL, 'markdown', ?, ?, ?)",
    ).bind(sourceId, item.space_id, input.title, now, now),
    env.DB.prepare(
      "INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, ?, ?, 'm1-v1', ?)",
    ).bind(sourceVersionId, sourceId, submissionId, markdown, hashFor(input.revisionId), now),
    env.DB.prepare(
      "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, '[]', ?, 'admin-1', ?)",
    ).bind(input.revisionId, input.knowledgeItemId, sourceVersionId, `/workspace/published/${item.space_id}/${input.knowledgeItemId}/${input.revisionId}.md`, hashFor(input.revisionId), input.title, input.visibility, now),
    env.DB.prepare("UPDATE knowledge_items SET current_revision_id = ?, updated_at = ? WHERE id = ?").bind(input.revisionId, now, input.knowledgeItemId),
    env.DB.prepare(
      "INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body) VALUES (?, ?, 0, '[\"Section\"]', 3, 3, ?, ?, '', ?)",
    ).bind(`${input.revisionId}-chunk-0`, input.revisionId, body, input.title, searchBody),
    ...(input.index === false ? [] : [env.DB.prepare(
      "INSERT INTO chunks_fts (chunk_id, title, tags, body) VALUES (?, ?, '', ?)",
    ).bind(`${input.revisionId}-chunk-0`, input.title, searchBody)]),
  ]);
}

function hashFor(value: string): string {
  return value.padEnd(64, "0").slice(0, 64).replace(/[^a-f0-9]/g, "a");
}

const noContentReader: PublishedContentReader = {
  async read() { throw new Error("content reader must not be called"); },
};

function capturePreparedSql(db: D1Database, prepared: string[]): D1Database {
  return new Proxy(db, {
    get(target, property) {
      if (property === "prepare") {
        return (query: string) => {
          prepared.push(query);
          return db.prepare(query);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function explain(sql: string, bindings: unknown[]): Promise<string> {
  const rows = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...bindings).all<{ detail: string }>();
  return rows.results.map(({ detail }) => detail).join("\n");
}

async function rejectedAppError(promise: Promise<unknown>): Promise<{
  code: string;
  message: string;
  status: number;
}> {
  try {
    await promise;
    throw new Error("expected rejection");
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return { code: error.code, message: error.message, status: error.status };
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function commitCanonical(
  stub: DurableObjectStub<KnowledgeBase>,
  input: Parameters<KnowledgeBase["commitPublishedContent"]>[0],
): Promise<PublishedContentReceipt> {
  const result = await stub.commitPublishedContent(input) as RpcResult<PublishedContentReceipt>;
  if (result.ok) return result.value;
  throw new AppError(result.error.code, result.error.message, result.error.status, result.error.retryable);
}

function disposeWorkspace(workspace: WorkspaceClient): void {
  const disposeSymbol = (Symbol as typeof Symbol & { dispose?: symbol }).dispose;
  const disposable = workspace as unknown as Record<symbol, unknown>;
  const dispose = disposeSymbol ? disposable[disposeSymbol] : undefined;
  if (typeof dispose === "function") dispose.call(workspace);
}

const now = "2026-08-22T00:00:00.000Z";
