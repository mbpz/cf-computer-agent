import { AnswerService } from "./ai/answer-service";
import { AssetsRepository } from "./assets/repository";
import { WorkersAiMarkdownConverter } from "./assets/ai-markdown";
import { WorkersAiImageConverter } from "./assets/ai-image";
import { AssetService } from "./assets/service";
import { CitedAnswerService } from "./ai/cited-answer-service";
import { ChatRepository } from "./chat/repository";
import { ChatConversationService } from "./chat/conversation-service";
import { D1ChatFeedbackRepository } from "./chat/feedback-repository";
import { ChatFeedbackService } from "./chat/feedback-service";
import { SourceSummaryService } from "./ai/source-summary-service";
import { FaqService } from "./ai/faq-service";
import { TimelineService } from "./ai/timeline-service";
import { BriefService } from "./ai/brief-service";
import { ComparisonService } from "./ai/comparison-service";
import { AuditRepository } from "./audit/repository";
import { AnalyticsRepository } from "./analytics/repository";
import { requireCapability } from "./authorization/policy";
import { APP_CONFIG } from "./config";
import { AppError, createRequestContext, errorResponse, jsonResponse, logRequestFailure, methodNotAllowed, parseJsonRequest, requireSameOrigin, type RequestContext } from "./http";
import { AutomationAuthenticator } from "./identity/automation";
import { createGitHubOAuthClient, type GitHubOAuthDiagnostic } from "./identity/github-oauth";
import { createWeChatOAuthClient } from "./identity/wechat-oauth";
import { resolvePrincipal, type Principal } from "./identity/principal";
import { SessionService } from "./identity/session";
import { emitStructuredLog } from "./ops/structured-log";
import { KnowledgeService } from "./knowledge/service";
import { createRequestPublishedContent } from "./knowledge/published-content";
import { WorkspaceRepository } from "./knowledge/workspace-repository";
import { LibraryRepository } from "./library/repository";
import { LibraryService } from "./library/service";
import { MembersRepository } from "./members/repository";
import { MembersService } from "./members/service";
import { PrivateNotesRepository } from "./private-notes/repository";
import { PrivateNotesService } from "./private-notes/service";
import { routeAdminApi } from "./routes/admin";
import { routeAdminReviewApi } from "./routes/admin-review";
import { routeAgentApi } from "./routes/agent";
import { clearOAuthCookies, clearWeChatCookie, routeAuth } from "./routes/auth";
import { routeLibraryApi } from "./routes/library";
import { routeMemberApi } from "./routes/member";
import { routeSession } from "./routes/session";
import { routeTelemetry } from "./routes/telemetry";
import { SpacesRepository } from "./spaces/repository";
import { SpacesService } from "./spaces/service";
import { PublicationRepository } from "./publication/repository";
import { PublicationService } from "./publication/service";
import { SubmissionsRepository } from "./submissions/repository";
import { SubmissionsService } from "./submissions/service";
import { TagsRepository } from "./tags/repository";
import { TagsService } from "./tags/service";
import { SourceReparseRepository } from "./sources/reparse-repository";
import { SourceReparseService } from "./sources/reparse-service";
import { SourcesRepository } from "./sources/repository";
import { SavedViewsRepository } from "./saved-views/repository";
import { SavedViewsService } from "./saved-views/service";
import { ResearchRepository } from "./research/repository";
import { ResearchReportService } from "./ai/research-report-service";
import { MindmapService } from "./ai/mindmap-service";
import { FlashcardService } from "./ai/flashcard-service";
import { QuizService } from "./ai/quiz-service";
import { createArtifactDraftTool, createCompareSourcesTool, createListSourceConflictsTool, createNoteDraftTool, createReadSourceTool, createSaveResearchDraftTool, createSearchKnowledgeTool } from "./agent/tools";
import { AgentToolRunner } from "./agent/tool-runner";
import { ReviewCommentsRepository } from "./review-comments/repository";
import { ReviewCommentsService } from "./review-comments/service";
import { FavoritesRepository } from "./favorites/repository";
import { FavoritesService } from "./favorites/service";
import { RecentVisitsRepository } from "./recent-visits/repository";
import { RecentVisitsService } from "./recent-visits/service";
import { DuplicateCandidatesRepository } from "./duplicates/repository";
import { DuplicateCandidatesService } from "./duplicates/service";
import { ReviewRepository } from "./review/repository";
import { ReviewService } from "./review/service";

export interface AppDependencies {
  ai?: Ai;
  githubFetch?: typeof fetch;
  assetFetch?: typeof fetch;
  sessionDatabase?: D1Database;
  /** Test/preview override; production uses the optional Env.ORIGINALS binding. */
  assetStorage?: R2Bucket | null;
  oauthDiagnostic?: (diagnostic: GitHubOAuthDiagnostic & { requestId: string }) => void;
}

export function createApp(dependencies: AppDependencies = {}): ExportedHandler<Env> {
  return {
    async fetch(request, env, ctx): Promise<Response> {
      const context = createRequestContext(request);
      const url = new URL(request.url);

      try {
        if (url.pathname.startsWith("/auth/")) {
          const services = createRequestServices(env, ctx, context, dependencies);
          try {
            const response = await routeAuth(request, url, context, services);
            if (!response) throw new AppError("NOT_FOUND", "Not found", 404);
            return response;
          } finally {
            services.legacyRepository.dispose();
            services.publishedContent.dispose();
          }
        }

        if (!url.pathname.startsWith("/api/")) {
          const assetRequest = knownWorkspaceRoute(url.pathname)
            ? new Request(new URL("/", url), request)
            : request;
          return withAssetSecurityHeaders(await env.ASSETS.fetch(assetRequest), context.requestId);
        }

        const services = createRequestServices(env, ctx, context, dependencies);
        try {
          if (url.pathname === "/api/telemetry/pageview") {
            const telemetry = await routeTelemetry(request, url, context, {
              analytics: services.analytics,
              sessions: services.sessions,
            });
            if (telemetry) return telemetry;
          }
          const resolved = await resolvePrincipal(request, {
            sessions: services.sessions,
            automation: services.automation,
            maxBodyBytes: APP_CONFIG.maxJsonRequestBytes,
          });
          if (resolved.principal.kind === "member" && !isSafeMethod(resolved.request.method)) {
            requireSameOrigin(resolved.request, APP_CONFIG.canonicalOrigin);
          }
          return await dispatchApiRequest(resolved.request, url, context, resolved.principal, services);
        } finally {
          services.legacyRepository.dispose();
          services.publishedContent.dispose();
        }
      } catch (error) {
        logRequestFailure(request, context, error);
        const response = errorResponse(error, context.requestId);
        return url.pathname === "/auth/github/callback" ? clearOAuthCookies(response)
          : url.pathname === "/auth/wechat/callback" ? clearWeChatCookie(response) : response;
      }
    },
  };
}

const workspaceRoutes = new Set([
  "/", "/submit", "/knowledge", "/search", "/agent", "/my-submissions",
  "/admin", "/admin/submissions", "/admin/duplicates", "/admin/assets", "/admin/members", "/admin/spaces", "/admin/audit", "/admin/analytics",
]);

function knownWorkspaceRoute(pathname: string): boolean {
  return workspaceRoutes.has(pathname)
    || /^\/knowledge\/[A-Za-z0-9_-]{1,128}$/u.test(pathname)
    || /^\/admin\/submissions\/[A-Za-z0-9_-]{1,128}$/u.test(pathname);
}

function createRequestServices(
  env: Env,
  ctx: ExecutionContext,
  context: RequestContext,
  dependencies: AppDependencies,
) {
  const ai = dependencies.ai || env.AI;
  const audit = new AuditRepository(env.DB);
  const analytics = new AnalyticsRepository(env.DB);
  const memberRecords = new MembersRepository(env.DB, audit);
  const members = new MembersService(memberRecords, env, {
    waitUntil: (promise) => ctx.waitUntil(promise),
  });
  const spaceRecords = new SpacesRepository(env.DB, audit);
  const legacyRepository = new WorkspaceRepository(env.KNOWLEDGE, APP_CONFIG.workspaceName);
  const publishedContent = createRequestPublishedContent(env.KNOWLEDGE, APP_CONFIG.workspaceName);
  const publicationRecords = new PublicationRepository(env.DB);
  const tags = new TagsService(new TagsRepository(env.DB));
  const library = new LibraryService(new LibraryRepository(env.DB), publishedContent.reader, audit);
  const sources = new SourcesRepository(env.DB);
  const submissions = new SubmissionsService(new SubmissionsRepository(env.DB, audit));
  const duplicates = new DuplicateCandidatesService(new DuplicateCandidatesRepository(env.DB, audit));
  const review = new ReviewService(new ReviewRepository(env.DB));
  const researchReports = new ResearchReportService(new ResearchRepository(env.DB), ai);
  const agentTools = new AgentToolRunner(memberRecords, [
    createSearchKnowledgeTool(library),
    createReadSourceTool(library),
    createCompareSourcesTool(library),
    createListSourceConflictsTool(sources),
    createNoteDraftTool(submissions),
    createArtifactDraftTool(researchReports, submissions),
    createSaveResearchDraftTool(researchReports, submissions),
  ], { audit });
  const assets = new AssetService(
    dependencies.assetStorage === undefined ? env.ORIGINALS : dependencies.assetStorage ?? undefined,
    new AssetsRepository(env.DB),
    {
      maxTotalBytes: APP_CONFIG.maxAssetTotalBytes,
      markdownConverter: new WorkersAiMarkdownConverter(env.AI),
      imageConverter: new WorkersAiImageConverter(env.AI),
      fetch: dependencies.assetFetch,
    },
  );
  const waitUntil = (promise: Promise<unknown>) => ctx.waitUntil(promise);
  return {
    answers: new AnswerService(ai),
    ai,
    agentSessions: env.AGENT_SESSIONS,
    agentTools,
    assets,
    automation: new AutomationAuthenticator(env.DB, env, { waitUntil }),
    audit,
    analytics,
    citedAnswers: new CitedAnswerService(ai),
    chatConversations: new ChatConversationService(new ChatRepository(env.DB)),
    chatFeedback: new ChatFeedbackService(new ChatRepository(env.DB), new D1ChatFeedbackRepository(env.DB)),
    sourceSummaries: new SourceSummaryService(ai),
    faqs: new FaqService(ai),
    timelines: new TimelineService(ai),
    briefs: new BriefService(ai),
    comparisons: new ComparisonService(ai),
    researchReports,
    mindmaps: new MindmapService(ai),
    flashcards: new FlashcardService(ai),
    quizzes: new QuizService(ai),
    knowledge: new KnowledgeService(legacyRepository),
    library,
    privateNotes: new PrivateNotesService(new PrivateNotesRepository(env.DB)),
    legacyRepository,
    memberRecords,
    members,
    publication: new PublicationService(publicationRecords, publishedContent.committer, publishedContent.remover),
    publishedContent,
    oauth: createGitHubOAuthClient({
      clientId: env.GITHUB_OAUTH_CLIENT_ID || "",
      clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET || "",
    }, {
      fetch: dependencies.githubFetch || globalThis.fetch,
      now: () => Date.now(),
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
      onUpstreamFailure: (diagnostic) => {
        const correlated = { requestId: context.requestId, ...diagnostic };
        if (dependencies.oauthDiagnostic) dependencies.oauthDiagnostic(correlated);
        else emitStructuredLog("warn", correlated);
      },
    }),
    wechat: createWeChatOAuthClient({
      appId: env.WECHAT_APP_ID || "",
      appSecret: env.WECHAT_APP_SECRET || "",
    }),
    sessions: new SessionService(dependencies.sessionDatabase || env.DB, memberRecords, { waitUntil }),
    spaces: new SpacesService(spaceRecords, spaceRecords),
    submissions,
    duplicates,
    tags,
    sourceReparse: new SourceReparseService(new SourceReparseRepository(env.DB)),
    savedViews: new SavedViewsService(new SavedViewsRepository(env.DB)),
    reviewComments: new ReviewCommentsService(new ReviewCommentsRepository(env.DB)),
    favorites: new FavoritesService(new FavoritesRepository(env.DB)),
    recentVisits: new RecentVisitsService(new RecentVisitsRepository(env.DB)),
    review,
  };
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

async function dispatchApiRequest(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: ReturnType<typeof createRequestServices>,
): Promise<Response> {
  if (url.pathname === "/api/health") {
    if (principal.kind !== "automation") throw new AppError("FORBIDDEN", "Automation access required", 403);
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    return jsonResponse({ ok: true }, 200, context.requestId);
  }

  const session = routeSession(request, url, context, principal);
  if (session) return session;
  const agent = await routeAgentApi(request, url, context, principal, services.agentSessions, services.ai, services.agentTools);
  if (agent) return agent;
  const member = await routeMemberApi(request, url, context, principal, services);
  if (member) return member;
  const admin = await routeAdminApi(request, url, context, principal, services);
  if (admin) return admin;
  const library = await routeLibraryApi(request, url, context, principal, services);
  if (library) return library;
  const adminReview = await routeAdminReviewApi(request, url, context, principal, services);
  if (adminReview) return adminReview;

  if (url.pathname === "/api/notes") {
    if (request.method === "GET") {
      requireCapability(principal, "legacy:read");
      return jsonResponse({ notes: await services.knowledge.listNotes() }, 200, context.requestId);
    }
    if (request.method === "POST") {
      requireCapability(principal, "legacy:write");
      const result = await services.legacyRepository.commitNote(
        await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      );
      return jsonResponse({ note: result.note }, result.created ? 201 : 200, context.requestId);
    }
    return methodNotAllowed("GET, POST", context);
  }

  if (url.pathname === "/api/search") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireCapability(principal, "legacy:read");
    return jsonResponse({ hits: await services.knowledge.search(url.searchParams.get("q") || "") }, 200, context.requestId);
  }

  if (url.pathname === "/api/chat") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireCapability(principal, "legacy:read");
    const body = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
    const question = getQuestion(body);
    const sources = await services.knowledge.search(question, 6);
    return jsonResponse(await services.answers.answer(question, sources), 200, context.requestId);
  }

  throw new AppError("NOT_FOUND", "Not found", 404);
}

function getQuestion(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const question = (value as Record<string, unknown>).question;
  return typeof question === "string" ? question : "";
}

function withAssetSecurityHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  // The HTML shell contains the hashed React entrypoint. Never let an edge
  // cache keep an older shell after a deployment, otherwise browser actions
  // (such as the POST-only logout control) can be wired to a stale bundle.
  if (headers.get("content-type")?.toLowerCase().startsWith("text/html") === true) {
    headers.set("cache-control", "no-store");
  }
  headers.set("content-security-policy", "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("x-request-id", requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
