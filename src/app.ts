import { AnswerService } from "./ai/answer-service";
import { AuditRepository } from "./audit/repository";
import { requireCapability } from "./authorization/policy";
import { APP_CONFIG } from "./config";
import { AppError, createRequestContext, errorResponse, jsonResponse, methodNotAllowed, parseJsonRequest, type RequestContext } from "./http";
import { resolvePrincipal, type Principal, type ResolvePrincipalDependencies } from "./identity/principal";
import { KnowledgeService } from "./knowledge/service";
import { WorkspaceRepository } from "./knowledge/workspace-repository";
import { MembersRepository } from "./members/repository";
import { MembersService } from "./members/service";
import { routeAdminApi } from "./routes/admin";
import { routeMemberApi } from "./routes/member";
import { routeSession } from "./routes/session";
import { SpacesRepository } from "./spaces/repository";
import { SpacesService } from "./spaces/service";
import { SubmissionsRepository } from "./submissions/repository";
import { SubmissionsService } from "./submissions/service";

export interface AppDependencies {
  verifyAccessJwt?: NonNullable<ResolvePrincipalDependencies["verifyAccessJwt"]>;
}

export function createApp(dependencies: AppDependencies = {}): ExportedHandler<Env> {
  return {
    async fetch(request, env, ctx): Promise<Response> {
      const context = createRequestContext(request);
      const url = new URL(request.url);

      try {
        if (!url.pathname.startsWith("/api/")) {
          return withAssetSecurityHeaders(await env.ASSETS.fetch(request), context.requestId);
        }

        const services = createRequestServices(env, ctx);
        try {
          const principal = await resolvePrincipal(request, env, {
            members: services.members,
            ...(dependencies.verifyAccessJwt ? { verifyAccessJwt: dependencies.verifyAccessJwt } : {}),
          });
          return await dispatchApiRequest(request, url, context, principal, services);
        } finally {
          services.legacyRepository.dispose();
        }
      } catch (error) {
        logRequestFailure(request, context, error);
        return errorResponse(error, context.requestId);
      }
    },
  };
}

function createRequestServices(env: Env, ctx: ExecutionContext) {
  const memberRecords = new MembersRepository(env.DB);
  const members = new MembersService(memberRecords, env, {
    waitUntil: (promise) => ctx.waitUntil(promise),
  });
  const spaceRecords = new SpacesRepository(env.DB);
  const audit = new AuditRepository(env.DB);
  const legacyRepository = new WorkspaceRepository(env.KNOWLEDGE, APP_CONFIG.workspaceName);
  return {
    answers: new AnswerService(env.AI),
    audit,
    knowledge: new KnowledgeService(legacyRepository),
    legacyRepository,
    memberRecords,
    members,
    spaces: new SpacesService(spaceRecords, spaceRecords),
    submissions: new SubmissionsService(new SubmissionsRepository(env.DB, audit)),
  };
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
  const member = await routeMemberApi(request, url, context, principal, services);
  if (member) return member;
  const admin = await routeAdminApi(request, url, context, principal, services);
  if (admin) return admin;

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
  headers.set("content-security-policy", "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("x-request-id", requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function logRequestFailure(request: Request, context: RequestContext, error: unknown): void {
  const appError = error instanceof AppError ? error : undefined;
  console.error("request failed", {
    requestId: context.requestId,
    method: request.method,
    path: new URL(request.url).pathname,
    code: appError?.code || "INTERNAL_ERROR",
    status: appError?.status || 500,
  });
}
