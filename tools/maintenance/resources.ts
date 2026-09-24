import type { MaintenanceCoordinator } from '../../src/maintenance/coordinator';

export interface LocalResources {
  MAINTENANCE_CONTROL_TOKEN?: string;
  MAINTENANCE: DurableObjectNamespace<MaintenanceCoordinator>;
  SYNTHETIC_DB: D1Database;
  SYNTHETIC_SESSION_DB: D1Database;
  SYNTHETIC_ORIGINALS: R2Bucket;
  KNOWLEDGE: Env['KNOWLEDGE'];
  AGENT_SESSIONS: Env['AGENT_SESSIONS'];
}

/** Test-only ports. No production config, credentials or AI binding is loaded. */
export function localEnvironment(resources: LocalResources): Env {
  return {
    MAINTENANCE_CONTROL_TOKEN: resources.MAINTENANCE_CONTROL_TOKEN,
    get DB() { return resources.SYNTHETIC_DB; },
    get ORIGINALS() { return resources.SYNTHETIC_ORIGINALS; },
    get KNOWLEDGE() { return resources.KNOWLEDGE; },
    get AGENT_SESSIONS() { return resources.AGENT_SESSIONS; },
    AI: { run: () => { throw new Error('UNEXPECTED_SYNTHETIC_AI'); },
      toMarkdown: () => { throw new Error('UNEXPECTED_SYNTHETIC_AI'); } },
    ASSETS: { fetch: async (request: Request) => {
      if (request.method !== 'GET' || new URL(request.url).pathname !== '/') {
        return new Response('Not found', { status: 404 });
      }
      return new Response('<html>synthetic local asset</html>', { headers: { 'Content-Type': 'text/html' } });
    } },
    GITHUB_OAUTH_CLIENT_ID: 'synthetic-client',
    GITHUB_OAUTH_CLIENT_SECRET: 'synthetic-secret',
    ALLOW_INSECURE_LOCAL: 'false',
  } as unknown as Env;
}
