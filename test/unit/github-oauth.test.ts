import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http";
import {
  createGitHubOAuthClient,
  type GitHubOAuthDependencies,
  type GitHubOAuthDiagnostic,
} from "../../src/identity/github-oauth";

const CLIENT_ID = "local-client-id";
const CLIENT_SECRET = "local-client-secret";
const CALLBACK_URL = "https://memory.crgmhrc.asia/auth/github/callback";
const API_HEADERS = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
};

describe("GitHub OAuth protocol", () => {
  it("creates independent random state and RFC 7636 S256 verifier material", async () => {
    const rfc7636VerifierBytes = Uint8Array.from([
      116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186,
      22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
    ]);
    let randomCall = 0;
    const client = oauthClient({
      randomBytes: (length) => randomCall++ === 0 ? new Uint8Array(length) : rfc7636VerifierBytes,
    });

    const start = await client.createStart();
    const url = new URL(start.authorizationUrl);

    expect(start.state).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(start.verifier).toBe("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    expect(start.state).not.toBe(start.verifier);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: CALLBACK_URL,
      scope: "read:user user:email",
      state: start.state,
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
      allow_signup: "false",
    });
  });

  it("exchanges the code with PKCE and returns one verified primary identity", async () => {
    const requests: RecordedRequest[] = [];
    const client = oauthClient({
      fetch: localFetch(requests,
        json({ access_token: "local-access-token", token_type: "bearer", scope: "read:user,user:email" }),
        json({ id: 42, login: "admin", node_id: "local-node", type: "User" }),
        json([
          { email: "secondary@example.test", primary: false, verified: true, visibility: null },
          { email: "  ADMIN@Example.Test  ", primary: true, verified: true, visibility: "private" },
        ]),
      ),
    });

    await expect(client.resolveCallback("local-code", verifier())).resolves.toEqual({
      subject: "github:42",
      githubUserId: "42",
      email: "admin@example.test",
    });

    expect(requests).toHaveLength(3);
    expect(requests[0]?.url).toBe("https://github.com/login/oauth/access_token");
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.redirect).toBe("manual");
    expect(requests[0]?.headers.get("accept")).toBe("application/json");
    expect(requests[0]?.headers.get("content-type")).toBe("application/x-www-form-urlencoded;charset=UTF-8");
    expect(Object.fromEntries(new URLSearchParams(requests[0]!.body))).toEqual({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: "local-code",
      redirect_uri: CALLBACK_URL,
      code_verifier: verifier(),
    });

    expect(requests[1]?.url).toBe("https://api.github.com/user");
    expect(requests[2]?.url).toBe("https://api.github.com/user/emails");
    for (const request of requests.slice(1)) {
      expect(request.method).toBe("GET");
      expect(request.redirect).toBe("manual");
      expect(request.headers.get("authorization")).toBe("Bearer local-access-token");
      expect(request.headers.get("accept")).toBe(API_HEADERS.accept);
      expect(request.headers.get("x-github-api-version")).toBe(API_HEADERS["x-github-api-version"]);
    }
  });

  it("rejects malformed callback inputs without fetching", async () => {
    let calls = 0;
    const client = oauthClient({ fetch: async () => { calls += 1; return json({}); } });

    for (const [code, codeVerifier] of [
      ["", verifier()],
      ["contains\nnewline", verifier()],
      ["local-code", "short"],
      ["local-code", `${verifier()}=`],
    ]) {
      await expect(client.resolveCallback(code, codeVerifier)).rejects.toMatchObject({
        code: "OAUTH_CALLBACK_INVALID", status: 400,
      });
    }
    expect(calls).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects a non-positive or non-integer GitHub id (%s)",
    async (id) => {
      const client = identityClient(json({ id }), validEmails());
      await expect(client.resolveCallback("local-code", verifier())).rejects.toMatchObject({
        code: "OAUTH_IDENTITY_INVALID", status: 401,
      });
    },
  );

  it.each([
    [],
    [{ email: "admin@example.test", primary: true, verified: false, visibility: null }],
    [{ email: "not-an-email", primary: true, verified: true, visibility: null }],
    [{ email: "admin@example..test", primary: true, verified: true, visibility: null }],
    [
      { email: "first@example.test", primary: true, verified: true, visibility: null },
      { email: "second@example.test", primary: true, verified: true, visibility: null },
    ],
    { email: "admin@example.test", primary: true, verified: true, visibility: null },
  ])("rejects missing, malformed, or ambiguous verified-primary email data", async (emails) => {
    const client = identityClient(json({ id: 42 }), json(emails));
    await expect(client.resolveCallback("local-code", verifier())).rejects.toMatchObject({
      code: "OAUTH_IDENTITY_INVALID", status: 401,
    });
  });

  it.each([
    ["token status", new Response("token-secret-in-body", { status: 502, headers: { "content-type": "text/plain" } })],
    ["wrong media type", new Response("token-secret-in-body", { headers: { "content-type": "text/plain" } })],
    ["malformed JSON", new Response("token-secret-in-body", { headers: { "content-type": "application/json" } })],
    ["missing token", json({ token: "token-secret-in-body" })],
  ])("maps %s failures to a stable redacted error", async (_label, response) => {
    const client = oauthClient({ fetch: async () => responseAt(response, "https://github.com/login/oauth/access_token") });
    const error = await rejected(client.resolveCallback("local-code-secret", verifier()));

    expect(error).toMatchObject({
      code: "OAUTH_UPSTREAM_UNAVAILABLE",
      message: "GitHub authentication is temporarily unavailable",
      status: 503,
      retryable: true,
    });
    expect(String(error)).not.toContain("token-secret-in-body");
    expect(String(error)).not.toContain("local-code-secret");
    expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
  });

  it("reports a fixed token-exchange diagnostic without upstream or credential content", async () => {
    const diagnostics: GitHubOAuthDiagnostic[] = [];
    const client = oauthClient({
      fetch: async () => responseAt(
        new Response("never-log-upstream-body", { status: 401, headers: { "content-type": "application/json" } }),
        "https://github.com/login/oauth/access_token",
      ),
      onUpstreamFailure: (diagnostic) => diagnostics.push(diagnostic),
    });

    await expect(client.resolveCallback("never-log-code", verifier())).rejects.toMatchObject({
      code: "OAUTH_UPSTREAM_UNAVAILABLE",
      status: 503,
    });
    expect(diagnostics).toEqual([{ stage: "token_exchange", reason: "status", httpStatus: 401 }]);
    expect(JSON.stringify(diagnostics)).not.toContain("never-log");
    expect(JSON.stringify(diagnostics)).not.toContain(CLIENT_SECRET);
  });

  it("rejects redirected and non-HTTPS upstream responses", async () => {
    for (const [responseUrl, redirected] of [
      ["https://github.com/login/oauth/access_token", true],
      ["https://attacker.example/token", false],
      ["http://github.com/login/oauth/access_token", false],
    ] as const) {
      const response = json({ access_token: "local-access-token" });
      Object.defineProperty(response, "url", { value: responseUrl });
      Object.defineProperty(response, "redirected", { value: redirected });
      const client = oauthClient({ fetch: async () => response });
      await expect(client.resolveCallback("local-code", verifier())).rejects.toMatchObject({
        code: "OAUTH_UPSTREAM_UNAVAILABLE", status: 503,
      });
    }
  });

  it("rejects an upstream response without an exact final URL before any follow-up request", async () => {
    let calls = 0;
    const responses = [
      json({ access_token: "local-access-token" }),
      json({ id: 42 }),
      validEmails(),
    ];
    const client = oauthClient({
      fetch: async () => {
        calls += 1;
        return responses.shift()!;
      },
    });

    await expect(client.resolveCallback("local-code", verifier())).rejects.toMatchObject({
      code: "OAUTH_UPSTREAM_UNAVAILABLE",
      status: 503,
    });
    expect(calls).toBe(1);
  });

  it("aborts a slow upstream request and returns a stable timeout error", async () => {
    const diagnostics: GitHubOAuthDiagnostic[] = [];
    const client = oauthClient({
      timeoutMs: 5,
      onUpstreamFailure: (diagnostic) => diagnostics.push(diagnostic),
      fetch: async (_input, init) => {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("local timeout detail", "AbortError")), { once: true });
        });
      },
    });

    const error = await rejected(client.resolveCallback("local-code", verifier()));
    expect(error).toMatchObject({ code: "OAUTH_UPSTREAM_UNAVAILABLE", status: 503 });
    expect(String(error)).not.toContain("local timeout detail");
    expect(diagnostics).toEqual([{ stage: "token_exchange", reason: "timeout" }]);
  });

  it("rejects response bodies over the configured bound without parsing them", async () => {
    const secretTail = "upstream-secret-tail";
    const body = `{"access_token":"${"x".repeat(9_000)}${secretTail}"}`;
    const client = oauthClient({
      fetch: async () => responseAt(jsonText(body), "https://github.com/login/oauth/access_token"),
    });

    const error = await rejected(client.resolveCallback("local-code", verifier()));
    expect(error).toMatchObject({ code: "OAUTH_UPSTREAM_UNAVAILABLE", status: 503 });
    expect(String(error)).not.toContain(secretTail);
  });

  it("rejects failures from user and email endpoints without exposing token or upstream data", async () => {
    for (const failedResponseIndex of [1, 2]) {
      const diagnostics: GitHubOAuthDiagnostic[] = [];
      const responses = [
        json({ access_token: "never-expose-token" }),
        json({ id: 42 }),
        validEmails(),
      ];
      responses[failedResponseIndex] = json({ detail: "never-expose-upstream-body" }, 500);
      const client = oauthClient({
        fetch: localFetch([], ...responses),
        onUpstreamFailure: (diagnostic) => diagnostics.push(diagnostic),
      });
      const error = await rejected(client.resolveCallback("local-code", verifier()));
      expect(error).toMatchObject({ code: "OAUTH_UPSTREAM_UNAVAILABLE", status: 503 });
      expect(String(error)).not.toContain("never-expose-token");
      expect(String(error)).not.toContain("never-expose-upstream-body");
      expect(diagnostics).toEqual([{
        stage: failedResponseIndex === 1 ? "user_fetch" : "email_fetch",
        reason: "status",
        httpStatus: 500,
      }]);
    }
  });
});

function oauthClient(overrides: Partial<GitHubOAuthDependencies> = {}) {
  return createGitHubOAuthClient(
    { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    {
      fetch: async () => { throw new Error("unexpected local fetch"); },
      now: () => 1_700_000_000_000,
      randomBytes: (length) => new Uint8Array(length),
      timeoutMs: 1_000,
      ...overrides,
    },
  );
}

function identityClient(user: Response, emails: Response) {
  return oauthClient({
    fetch: localFetch([], json({ access_token: "local-access-token" }), user, emails),
  });
}

interface RecordedRequest {
  url: string;
  method: string;
  redirect: RequestRedirect | undefined;
  headers: Headers;
  body: string;
}

function localFetch(requests: RecordedRequest[], ...responses: Response[]): typeof fetch {
  return async (input, init) => {
    const inputRequest = input instanceof Request ? input : undefined;
    const body = init?.body;
    requests.push({
      url: inputRequest?.url ?? String(input),
      method: init?.method ?? inputRequest?.method ?? "GET",
      redirect: init?.redirect ?? inputRequest?.redirect,
      headers: new Headers(init?.headers ?? inputRequest?.headers),
      body: typeof body === "string" ? body : body instanceof URLSearchParams ? body.toString() : "",
    });
    const response = responses.shift();
    if (!response) throw new Error("unexpected local fetch");
    return responseAt(response, inputRequest?.url ?? String(input));
  };
}

function responseAt(response: Response, url: string): Response {
  if (response.url === "") Object.defineProperty(response, "url", { value: url });
  return response;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function jsonText(value: string): Response {
  return new Response(value, { headers: { "content-type": "application/json" } });
}

function validEmails(): Response {
  return json([{ email: "admin@example.test", primary: true, verified: true, visibility: null }]);
}

function verifier(): string {
  return "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abcde";
}

async function rejected(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error("expected promise to reject");
}
