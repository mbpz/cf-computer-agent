import { describe, expect, it } from "vitest";
import * as workspaceUi from "../../public/workspace-ui.js";

const {
  anonymousShellState,
  appendPage,
  chatRequest,
  citedAnswerModel,
  createMutationController,
  createOwnedActionController,
  createOperationGuard,
  createRouteGuard,
  drawerState,
  drawerStateForViewport,
  knowledgeListModel,
  knowledgeQuery,
  knowledgeReaderModel,
  knowledgeReaderRequest,
  knowledgeSearchModel,
  publishRequest,
  postLogout,
  renderKnowledgeSearch,
  reviewPreviewModel,
  reviewTargetModel,
  routeState,
  sessionBootstrapState,
  submissionRequest,
  runLatestOperation,
  submissionResultModel,
} = workspaceUi;

describe("createRouteGuard", () => {
  it("rejects an older route completion after newer navigation begins", () => {
    const guard = createRouteGuard();
    const home = guard.begin();
    const search = guard.begin();

    expect(guard.isCurrent(home)).toBe(false);
    expect(guard.isCurrent(search)).toBe(true);
  });

  it("rejects an old-render mutation handler after a newer route begins", () => {
    const guard = createRouteGuard();
    const submitGeneration = guard.begin();
    const submission = guard.owner(submitGeneration, "/submit");

    expect(guard.owns(submission, "/submit")).toBe(true);
    guard.begin();
    expect(guard.owns(submission, "/submit")).toBe(false);
  });
});

describe("createOperationGuard", () => {
  it("lets only the newest same-route operation update its result", () => {
    const guard = createOperationGuard();
    const first = guard.begin();
    const second = guard.begin();

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  it("prevents an older same-route error from replacing a newer success", () => {
    const guard = createOperationGuard();
    const older = guard.begin();
    const newer = guard.begin();
    const rendered: string[] = [];

    if (guard.isCurrent(newer)) rendered.push("newer-success");
    if (guard.isCurrent(older)) rendered.push("older-error");

    expect(rendered).toEqual(["newer-success"]);
  });

  it("suppresses an older completion after a newer same-route operation finishes", async () => {
    const guard = createOperationGuard();
    const first = deferred<string>();
    const second = deferred<string>();
    const rendered: string[] = [];

    const firstRun = runLatestOperation(guard, () => first.promise, (value) => rendered.push(value), () => undefined);
    const secondRun = runLatestOperation(guard, () => second.promise, (value) => rendered.push(value), () => undefined);
    second.resolve("newer-success");
    await secondRun;
    first.resolve("older-success");
    await firstRun;

    expect(rendered).toEqual(["newer-success"]);
  });

  it("suppresses an older error after a newer same-route operation succeeds", async () => {
    const guard = createOperationGuard();
    const first = deferred<string>();
    const second = deferred<string>();
    const rendered: string[] = [];

    const firstRun = runLatestOperation(guard, () => first.promise, (value) => rendered.push(value), (error) => rendered.push(String(error)));
    const secondRun = runLatestOperation(guard, () => second.promise, (value) => rendered.push(value), (error) => rendered.push(String(error)));
    second.resolve("newer-success");
    await secondRun;
    first.reject(new Error("older-error"));
    await firstRun;

    expect(rendered).toEqual(["newer-success"]);
  });

  it("does not invoke an operation after its renderer loses ownership", async () => {
    const guard = createOperationGuard();
    let operations = 0;

    await runLatestOperation(
      guard,
      async () => { operations += 1; },
      () => undefined,
      () => undefined,
      () => false,
    );

    expect(operations).toBe(0);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("drawerState", () => {
  it("removes a closed mobile drawer from focus and accessibility navigation", () => {
    expect(drawerState(false)).toEqual({ open: false, ariaExpanded: "false", ariaHidden: "true", inert: true, label: "Open navigation" });
  });

  it("exposes an open mobile drawer", () => {
    expect(drawerState(true)).toEqual({ open: true, ariaExpanded: "true", ariaHidden: "false", inert: false, label: "Close navigation" });
  });

  it("keeps authenticated mobile navigation inert until its drawer opens", () => {
    expect(drawerStateForViewport(true, false)).toEqual({
      open: false, ariaExpanded: "false", ariaHidden: "true", inert: true, label: "Open navigation",
    });
  });

  it("keeps authenticated desktop navigation exposed without claiming an open drawer", () => {
    expect(drawerStateForViewport(false, false)).toEqual({
      open: false, ariaExpanded: "false", ariaHidden: "false", inert: false, label: "Open navigation",
    });
  });
});

describe("sessionBootstrapState", () => {
  it("treats an anonymous session response as an inert login state", () => {
    expect(sessionBootstrapState(401)).toEqual({ kind: "anonymous" });
  });

  it("keeps a valid member session available to the capability-driven shell", () => {
    const session = {
      member: { id: "member-1", email: "contributor@example.test", role: "contributor" },
      capabilities: ["legacy:read", "submission:create", "submission:read-own"],
    };

    expect(sessionBootstrapState(200, session)).toEqual({ kind: "authenticated", session });
  });

  it("does not mistake a non-session failure for an anonymous login", () => {
    expect(sessionBootstrapState(500)).toEqual({ kind: "error" });
  });
});

describe("postLogout", () => {
  it("posts logout with browser credentials then returns the login state", async () => {
    const requests: Array<{ path: string; init: RequestInit }> = [];
    const request = async (path: string, init: RequestInit) => {
      requests.push({ path, init });
      return new Response(null, { status: 204 });
    };

    await expect(postLogout(request)).resolves.toEqual({ kind: "anonymous" });
    expect(requests).toEqual([{ path: "/auth/logout", init: { method: "POST", credentials: "same-origin" } }]);
  });
});

describe("createLogoutController", () => {
  const factory = (workspaceUi as typeof workspaceUi & {
    createLogoutController?: (
      request: typeof fetch,
      callbacks: {
        onPendingChange: (pending: boolean) => void;
        onSuccess: () => void;
        onError: (error: unknown) => void;
      },
    ) => { run: () => Promise<void>; invalidate: () => void };
  }).createLogoutController;

  it("keeps logout single-flight and exposes pending state for disabling the button", async () => {
    expect(factory).toBeTypeOf("function");
    if (!factory) return;
    const response = deferred<Response>();
    const pending: boolean[] = [];
    let requests = 0;
    let successes = 0;
    const controller = factory(async () => {
      requests += 1;
      return response.promise;
    }, {
      onPendingChange: (value) => pending.push(value),
      onSuccess: () => { successes += 1; },
      onError: () => undefined,
    });

    const first = controller.run();
    const duplicate = controller.run();
    expect(duplicate).toBe(first);
    expect(requests).toBe(1);
    expect(pending).toEqual([true]);

    response.resolve(new Response(null, { status: 204 }));
    await first;
    expect(pending).toEqual([true, false]);
    expect(successes).toBe(1);
  });

  it.each([
    ["failure", new Error("stale logout failure"), new Response(null, { status: 204 }), ["new-success"]],
    ["success", new Response(null, { status: 204 }), new Response(null, { status: 500 }), ["new-error"]],
  ])("generation-guards a late old %s after a newer completion", async (_label, oldResult, newResult, expected) => {
    expect(factory).toBeTypeOf("function");
    if (!factory) return;
    const oldResponse = deferred<Response>();
    const newResponse = deferred<Response>();
    const responses = [oldResponse, newResponse];
    const rendered: string[] = [];
    const controller = factory(async () => responses.shift()!.promise, {
      onPendingChange: () => undefined,
      onSuccess: () => rendered.push(responses.length === 0 ? "new-success" : "old-success"),
      onError: () => rendered.push(responses.length === 0 ? "new-error" : "old-error"),
    });

    const oldRun = controller.run();
    controller.invalidate();
    const newRun = controller.run();
    if (newResult instanceof Error) newResponse.reject(newResult);
    else newResponse.resolve(newResult);
    await newRun;
    if (oldResult instanceof Error) oldResponse.reject(oldResult);
    else oldResponse.resolve(oldResult);
    await oldRun;

    expect(rendered).toEqual(expected);
  });
});

describe("anonymousShellState", () => {
  it("clears a private status flash when logout returns the shell to login", () => {
    const privateStatus = "已提交“Private submission”";
    const state = anonymousShellState();

    expect(state.statusMessage).toBe("");
    expect(state.statusMessage).not.toContain(privateStatus);
  });

  it("closes an open mobile drawer before showing the anonymous login", () => {
    const state = anonymousShellState();

    expect(state.drawer).toEqual({ open: false, ariaExpanded: "false", ariaHidden: "true", inert: true, label: "Open navigation" });
  });
});

describe("M1 trusted knowledge view models", () => {
  it("maps search hits to exact reader locations without retaining internal fields", () => {
    const model = knowledgeSearchModel({
      items: [{
        citationId: "citation-1",
        knowledgeItemId: "knowledge-1",
        spaceId: "space-1",
        collectionId: "collection-1",
        revisionId: "revision-1",
        chunkId: "chunk-1",
        title: "Runbook",
        headingPath: ["Launch", "Rollback"],
        startLine: 7,
        endLine: 11,
        excerpt: "<img src=x onerror=alert(1)><script>alert(2)</script>",
        score: -1,
        publishedAt: "2026-08-22T00:00:00.000Z",
        normalizedPath: "/workspace/published/private.md",
        contentSha256: "secret-hash",
        sourceVersionId: "source-secret",
      }],
      degraded: true,
      nextCursor: "next-page",
    });

    expect(model).toMatchObject({
      degraded: true,
      nextCursor: "next-page",
      items: [{
        title: "Runbook",
        location: "Launch › Rollback · lines 7–11",
        citationHref: "/knowledge/knowledge-1?revision=revision-1&chunk=chunk-1",
      }],
    });
    expect(JSON.stringify(model)).not.toMatch(/workspace\/published|secret-hash|source-secret/);
    expect(renderKnowledgeSearch(model)).toContain("&lt;script&gt;");
    expect(renderKnowledgeSearch(model)).not.toMatch(/<script|onerror=/i);
  });

  it("models shared and admin-only library badges and preserves bounded pagination", () => {
    const first = knowledgeListModel({
      items: [libraryItem("knowledge-1", "Shared runbook", "shared")],
      nextCursor: "cursor-2",
    });
    const second = knowledgeListModel({
      items: [
        libraryItem("knowledge-1", "Shared runbook", "shared"),
        libraryItem("knowledge-2", "Private policy", "admin_only"),
      ],
    });

    expect(first.items[0]).toMatchObject({ visibilityLabel: "Shared", href: "/knowledge/knowledge-1" });
    expect(second.items[1]).toMatchObject({ visibilityLabel: "Admin only", href: "/knowledge/knowledge-2" });
    expect(appendPage(first.items, second.items, (item) => item.id).map((item) => item.id)).toEqual([
      "knowledge-1", "knowledge-2",
    ]);
  });

  it("uses the server-owned chunk preview without parsing Markdown in the browser", () => {
    const model = reviewPreviewModel({
      submissionId: "submission-1",
      submitterId: "member-1",
      status: "review_pending",
      requestedSpaceId: "space-1",
      requestedCollectionId: null,
      kind: "markdown",
      title: "<script>Unsafe title</script>",
      rawContent: "# Launch  \r\n\r\n## Rollback   \r\n",
      sourceVersion: {
        id: "source-version-1",
        kind: "markdown",
        content: "# Launch\n\n## Rollback\nNever execute <img onerror=alert(1)>\n",
        parserVersion: "m1-v1",
        contentSha256: "must-not-leak",
        normalizedPath: "/workspace/private.md",
      },
      chunks: [{
        headingPath: ["Launch", "Rollback"],
        startLine: 4,
        endLine: 7,
        excerpt: "Never execute <img onerror=alert(1)>",
        normalizedPath: "/workspace/chunk-private.md",
        contentSha256: "chunk-secret",
      }],
    });

    expect(model).toMatchObject({
      submissionId: "submission-1",
      title: "<script>Unsafe title</script>",
      rawInput: "# Launch  \r\n\r\n## Rollback   \r\n",
      normalizedMarkdown: expect.stringContaining("## Rollback"),
      chunks: [
        {
          heading: "Launch › Rollback",
          startLine: 4,
          endLine: 7,
          lineLabel: "lines 4–7",
          excerpt: "Never execute <img onerror=alert(1)>",
        },
      ],
    });
    expect(model.warnings).toContain("Preview is inert text; Markdown and HTML are never executed.");
    expect(JSON.stringify(model)).not.toMatch(/must-not-leak|chunk-secret|workspace\/private|chunk-private/);
  });

  it("keeps the requested review target fixed and scopes tags to that Space", () => {
    const target = reviewTargetModel({
      requestedSpaceId: "space-requested",
      requestedCollectionId: "collection-requested",
    }, [
      { id: "space-other", name: "Other", status: "active", kind: "shared", readOnly: false },
      { id: "space-requested", name: "Requested", status: "active", kind: "shared", readOnly: false },
    ], [
      { id: "collection-other", spaceId: "space-requested", name: "Other collection", status: "active" },
      { id: "collection-requested", spaceId: "space-requested", name: "Requested collection", status: "active" },
    ]);

    expect(target).toEqual({
      spaceId: "space-requested",
      spaceLabel: "Requested",
      collectionId: "collection-requested",
      collectionLabel: "Requested collection",
      tagSpaceId: "space-requested",
      available: true,
    });
    expect(JSON.stringify(target)).not.toContain("space-other");
  });

  it("models reader history, exact chunk focus, and citation source navigation", () => {
    const model = knowledgeReaderModel({
      id: "knowledge-1",
      title: "Launch runbook",
      visibility: "admin_only",
      searchStatus: "indexed",
      currentRevision: {
        id: "revision-current",
        knowledgeItemId: "knowledge-1",
        sourceVersionId: "source-secret",
        title: "Launch runbook",
        tagIds: ["tag-1"],
        visibility: "admin_only",
        publishedBy: "member-secret",
        publishedAt: "2026-08-22T00:00:00.000Z",
        isCurrent: true,
        markdown: "# Launch\n\nLatency is bounded.\n",
        chunks: [{
          id: "chunk-1",
          citationId: "citation-1",
          ordinal: 0,
          headingPath: ["Launch"],
          startLine: 1,
          endLine: 3,
        }],
      },
    }, { revision: "revision-current", chunk: "chunk-1" });

    expect(model).toMatchObject({
      revisionLabel: "Revision revision-current · current",
      visibilityLabel: "Admin only",
      focusedChunkId: "chunk-1",
      outline: [{ label: "Launch", lineLabel: "lines 1–3", focused: true }],
      sources: [{
        label: "Launch · lines 1–3",
        href: "/knowledge/knowledge-1?revision=revision-current&chunk=chunk-1",
      }],
    });
    expect(JSON.stringify(model)).not.toMatch(/source-secret|member-secret/);
  });

  it("keeps a server-declared historical Revision citation-navigable even when no current detail was loaded", () => {
    const model = knowledgeReaderModel({
      id: "revision-old",
      knowledgeItemId: "knowledge-1",
      title: "Old shared runbook",
      visibility: "shared",
      isCurrent: false,
      markdown: "# Old\n\nStill readable.\n",
      chunks: [{
        id: "chunk-old",
        citationId: "citation-old",
        headingPath: ["Old"],
        startLine: 3,
        endLine: 3,
      }],
    }, { revision: "revision-old", chunk: "chunk-old" });

    expect(model).toMatchObject({
      isCurrent: false,
      revisionLabel: "Revision revision-old · history",
      sources: [{ href: "/knowledge/knowledge-1?revision=revision-old&chunk=chunk-old" }],
    });
  });

  it("models citation-grounded answers using only server-provided source hits", () => {
    const model = citedAnswerModel({
      answer: "Launch latency is documented. [1] <script>alert(1)</script>",
      citations: ["citation-1"],
      sources: [{
        ...searchHit("citation-1", "knowledge-1", "revision-1", "chunk-1"),
        normalizedPath: "/workspace/secret.md",
        contentSha256: "secret-hash",
      }],
    });

    expect(model.sources).toEqual([expect.objectContaining({
      accessibleName: "Open citation 1: Runbook, Launch, lines 2–4",
      href: "/knowledge/knowledge-1?revision=revision-1&chunk=chunk-1",
    })]);
    expect(JSON.stringify(model)).not.toMatch(/workspace\/secret|secret-hash/);
  });
});

describe("M1 route state and mutation ownership", () => {
  it.each([
    ["loading", "Loading knowledge", { kind: "loading", message: "Loading knowledge" }],
    ["empty", "No knowledge yet", { kind: "empty", message: "No knowledge yet" }],
    ["error", new Error("Unsafe <script>"), { kind: "error", message: "Unsafe <script>" }],
    ["forbidden", "Not permitted", { kind: "forbidden", message: "Not permitted" }],
    ["degraded", "FTS index degraded", { kind: "degraded", message: "FTS index degraded" }],
  ])("keeps the %s state as inert text", (kind, value, expected) => {
    expect(routeState(kind, value)).toEqual(expected);
  });

  it("keeps duplicate submit clicks single-flight and reports the duplicate result", async () => {
    const response = deferred<{ duplicateCandidate: { submissionId: string; title: string } }>();
    const pending: boolean[] = [];
    const rendered: unknown[] = [];
    let requests = 0;
    const controller = createMutationController(() => true, (value) => pending.push(value));

    const first = controller.run(async () => {
      requests += 1;
      return response.promise;
    }, (value) => rendered.push(submissionResultModel(value)), () => undefined);
    const duplicate = controller.run(async () => {
      requests += 1;
      return response.promise;
    }, (value) => rendered.push(value), () => undefined);

    expect(duplicate).toBe(first);
    expect(requests).toBe(1);
    response.resolve({ duplicateCandidate: { submissionId: "submission-existing", title: "Existing" } });
    await first;
    expect(pending).toEqual([true, false]);
    expect(rendered).toEqual([{
      kind: "duplicate",
      message: "A matching submission already exists: Existing.",
      submissionId: "submission-existing",
    }]);
  });

  it("keeps repeated Agent submit and Enter events to one in-flight request and restores owned controls", async () => {
    const response = deferred<{ answer: string }>();
    const pending: boolean[] = [];
    let requests = 0;
    const controller = createMutationController(() => true, (value) => pending.push(value));
    const operation = async () => { requests += 1; return response.promise; };

    const submit = controller.run(operation, () => undefined, () => undefined);
    const enter = controller.run(operation, () => undefined, () => undefined);

    expect(enter).toBe(submit);
    expect(requests).toBe(1);
    expect(pending).toEqual([true]);
    response.resolve({ answer: "Grounded" });
    await submit;
    expect(pending).toEqual([true, false]);
  });

  it("makes a late mutation completion inert after its renderer loses ownership", async () => {
    const guard = createRouteGuard();
    const generation = guard.begin();
    const owner = guard.owner(generation, "/admin/submissions/submission-1");
    const response = deferred<string>();
    const rendered: string[] = [];
    const pending: boolean[] = [];
    const controller = createMutationController(
      () => guard.owns(owner, "/admin/submissions/submission-1"),
      (value) => pending.push(value),
    );

    const run = controller.run(() => response.promise, (value) => rendered.push(value), () => rendered.push("error"));
    guard.begin();
    response.resolve("stale publish success");
    await run;

    expect(rendered).toEqual([]);
    expect(pending).toEqual([true]);
  });

  it("restores Agent controls after an owned request error", async () => {
    const pending: boolean[] = [];
    const errors: string[] = [];
    const controller = createMutationController(() => true, (value) => pending.push(value));

    await controller.run(
      async () => { throw new Error("AI unavailable"); },
      () => undefined,
      (error) => errors.push(String(error)),
    );

    expect(errors).toEqual(["Error: AI unavailable"]);
    expect(pending).toEqual([true, false]);
  });

  it("does not invoke a mutation after its renderer loses ownership", async () => {
    let owns = true;
    let requests = 0;
    const pending: boolean[] = [];
    const controller = createMutationController(() => owns, (value) => pending.push(value));
    owns = false;

    await controller.run(async () => { requests += 1; }, () => undefined, () => undefined);

    expect(requests).toBe(0);
    expect(pending).toEqual([]);
  });

  it.each(["publish", "reject", "recovery"])("invalidates an open %s dialog before its old confirm handler can run", (kind) => {
    const guard = createRouteGuard();
    const generation = guard.begin();
    const pathname = kind === "recovery" ? "/admin" : "/admin/submissions/submission-1";
    const owner = guard.owner(generation, pathname);
    let operations = 0;
    const dialog = createOwnedActionController(
      () => guard.owns(owner, pathname),
      () => { operations += 1; },
    );

    guard.begin();
    dialog.invalidate();

    expect(dialog.run()).toBe(false);
    expect(dialog.canReturnFocus()).toBe(false);
    expect(operations).toBe(0);
  });
});

describe("M1 browser request allowlists", () => {
  it("puts idempotency only in the header and strips identity and internal fields", () => {
    const request = submissionRequest({
      requestedSpaceId: "space-1",
      requestedCollectionId: "collection-1",
      kind: "markdown",
      title: "Runbook",
      content: "# Runbook",
      language: "markdown",
      memberId: "forged-member",
      role: "admin",
      idempotencyKey: "body-key",
      sources: ["forged"],
      citations: ["forged"],
      normalizedPath: "/workspace/private.md",
      contentSha256: "secret-hash",
    }, "header-key-00001");

    expect(request).toMatchObject({
      path: "/api/submissions",
      init: { method: "POST", headers: { "Idempotency-Key": "header-key-00001" } },
    });
    expect(JSON.parse(request.init.body)).toEqual({
      requestedSpaceId: "space-1",
      requestedCollectionId: "collection-1",
      kind: "markdown",
      title: "Runbook",
      content: "# Runbook",
      language: "markdown",
    });
  });

  it("builds exact publish and chat bodies from allowlisted fields", () => {
    const publish = publishRequest("submission/1", {
      title: "Runbook",
      visibility: "shared",
      spaceId: "space-1",
      collectionId: null,
      tagIds: ["tag-1"],
      reviewerId: "forged",
      memberId: "forged",
      contentSha256: "secret",
    });
    const chat = chatRequest({ question: "launch latency", sources: ["forged"], role: "admin" });

    expect(publish.path).toBe("/api/admin/submissions/submission%2F1/publish");
    expect(JSON.parse(publish.init.body)).toEqual({
      title: "Runbook",
      visibility: "shared",
      spaceId: "space-1",
      collectionId: null,
      tagIds: ["tag-1"],
    });
    expect(JSON.parse(chat.init.body)).toEqual({ question: "launch latency" });
  });

  it("builds bounded library and search queries without accepting arbitrary parameters", () => {
    expect(knowledgeQuery("/api/knowledge/search", {
      q: "launch latency",
      limit: 20,
      cursor: "next",
      spaceId: "space-1",
      collectionId: "collection-1",
      tagId: "tag-1",
      role: "admin",
      path: "/workspace/private.md",
    })).toBe("/api/knowledge/search?q=launch+latency&limit=20&cursor=next&spaceId=space-1&collectionId=collection-1&tagId=tag-1");
  });

  it("loads a requested historical Revision directly without first probing the current detail", () => {
    expect(knowledgeReaderRequest("knowledge/1", "revision/old")).toEqual({
      path: "/api/knowledge/knowledge%2F1/revisions/revision%2Fold",
      responseKey: "revision",
    });
    expect(knowledgeReaderRequest("knowledge/1", "")).toEqual({
      path: "/api/knowledge/knowledge%2F1",
      responseKey: "knowledge",
    });
  });
});

function libraryItem(id: string, title: string, visibility: "shared" | "admin_only") {
  return {
    id,
    spaceId: "space-1",
    collectionId: null,
    revisionId: `revision-${id}`,
    title,
    tagIds: [],
    visibility,
    searchStatus: "indexed",
    publishedAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
}

function searchHit(citationId: string, knowledgeItemId: string, revisionId: string, chunkId: string) {
  return {
    citationId,
    knowledgeItemId,
    spaceId: "space-1",
    collectionId: null,
    revisionId,
    chunkId,
    title: "Runbook",
    headingPath: ["Launch"],
    startLine: 2,
    endLine: 4,
    excerpt: "Launch latency is documented.",
    score: -1,
    publishedAt: "2026-08-22T00:00:00.000Z",
  };
}
