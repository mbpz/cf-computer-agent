import { AnswerService } from "./ai/answer-service";
import { authorizeRequest } from "./auth";
import { APP_CONFIG } from "./config";
import { AppError, createRequestContext, errorResponse, jsonResponse, parseJsonRequest, type RequestContext } from "./http";
import { KnowledgeService } from "./knowledge/service";
import { WorkspaceRepository } from "./knowledge/workspace-repository";

export function createApp(): ExportedHandler<Env> {
  return {
    async fetch(request, env): Promise<Response> {
      const context = createRequestContext(request);
      const url = new URL(request.url);

      try {
        if (!url.pathname.startsWith("/api/")) {
          return withAssetSecurityHeaders(await env.ASSETS.fetch(request), context.requestId);
        }

        await authorizeRequest(request, env);
        return await dispatchApiRequest(request, url, env, context);
      } catch (error) {
        logRequestFailure(request, context, error);
        return errorResponse(error, context.requestId);
      }
    },
  };
}

async function dispatchApiRequest(
  request: Request,
  url: URL,
  env: Env,
  context: RequestContext,
): Promise<Response> {
  const repository = new WorkspaceRepository(env.KNOWLEDGE, APP_CONFIG.workspaceName);
  try {
    const knowledge = new KnowledgeService(repository);
    const answers = new AnswerService(env.AI);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") return methodNotAllowed("GET", context);
      return jsonResponse({ ok: true }, 200, context.requestId);
    }

    if (url.pathname === "/api/notes") {
      if (request.method === "GET") {
        return jsonResponse({ notes: await knowledge.listNotes() }, 200, context.requestId);
      }
      if (request.method === "POST") {
        const result = await repository.commitNote(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes));
        return jsonResponse({ note: result.note }, result.created ? 201 : 200, context.requestId);
      }
      return methodNotAllowed("GET, POST", context);
    }

    if (url.pathname === "/api/search") {
      if (request.method !== "GET") return methodNotAllowed("GET", context);
      return jsonResponse({ hits: await knowledge.search(url.searchParams.get("q") || "") }, 200, context.requestId);
    }

    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") return methodNotAllowed("POST", context);
      const body = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
      const question = getQuestion(body);
      const sources = await knowledge.search(question, 6);
      return jsonResponse(await answers.answer(question, sources), 200, context.requestId);
    }

    throw new AppError("NOT_FOUND", "Not found", 404);
  } finally {
    repository.dispose();
  }
}

function getQuestion(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const question = (value as Record<string, unknown>).question;
  return typeof question === "string" ? question : "";
}

function methodNotAllowed(allow: string, context: RequestContext): Response {
  const response = errorResponse(new AppError("METHOD_NOT_ALLOWED", "Method not allowed", 405), context.requestId);
  const headers = new Headers(response.headers);
  headers.set("allow", allow);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
