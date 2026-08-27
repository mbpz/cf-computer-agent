import { AppError, requireNoQuery, jsonResponse, methodNotAllowed, parseJsonRequest, requireSameOrigin, type RequestContext } from "../http";
import { APP_CONFIG } from "../config";
import type { SessionService } from "../identity/session";
import type { AnalyticsRepository } from "../analytics/repository";
import { dailyVisitorHash, visitDimensions } from "../analytics/identity";

export interface TelemetryRouteServices {
  analytics: AnalyticsRepository;
  sessions: Pick<SessionService, "resolve">;
}

export async function routeTelemetry(
  request: Request,
  url: URL,
  context: RequestContext,
  services: TelemetryRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/telemetry/pageview") return undefined;
  if (request.method !== "POST") return methodNotAllowed("POST", context);
  requireSameOrigin(request, APP_CONFIG.canonicalOrigin);
  requireNoQuery(url);
  const input = await parseJsonRequest(request, 8 * 1024);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AppError("TELEMETRY_INVALID", "Telemetry payload is invalid", 400);
  const path = (input as Record<string, unknown>).path;
  if (typeof path !== "string" || !/^\/[A-Za-z0-9_./-]{0,160}$/u.test(path)) throw new AppError("TELEMETRY_INVALID", "Telemetry path is invalid", 400);
  const occurredAt = new Date();
  const day = occurredAt.toISOString().slice(0, 10);
  const member = await services.sessions.resolve(request).catch(() => null);
  const dimensions = visitDimensions(request);
  await services.analytics.recordPageView({
    id: crypto.randomUUID(),
    path,
    visitorHash: await dailyVisitorHash(request, day),
    memberId: member?.id ?? null,
    occurredAt,
    ...dimensions,
  });
  return jsonResponse({ ok: true }, 202, context.requestId);
}
