export type SensitiveFindingCode = "credential" | "private_key" | "internal_endpoint";

export interface SensitiveFinding {
  code: SensitiveFindingCode;
  severity: "high" | "medium";
  line: number;
  messageKey: "publication.safety.credential" | "publication.safety.privateKey" | "publication.safety.internalEndpoint";
}

export interface SensitiveAdvice {
  status: "clear" | "advisory";
  findings: SensitiveFinding[];
}

const MAX_FINDINGS = 20;
const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u;
const GITHUB_TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u;
const AWS_ACCESS_KEY = /\bAKIA[0-9A-Z]{16}\b/u;
const BEARER_TOKEN = /\bBearer\s+([A-Za-z0-9._~+/=-]{16,})\b/iu;
const ASSIGNED_SECRET = /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|secret)\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{16,})/iu;
const INTERNAL_ENDPOINT = /\b(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3})(?::\d{2,5})?\b/iu;

export function analyzeSensitiveContent(content: string): SensitiveAdvice {
  if (typeof content !== "string" || content.length === 0) return { status: "clear", findings: [] };
  const findings: SensitiveFinding[] = [];
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    if (findings.length >= MAX_FINDINGS) break;
    const lineNumber = index + 1;
    if (PRIVATE_KEY.test(line)) addFinding(findings, { code: "private_key", severity: "high", line: lineNumber, messageKey: "publication.safety.privateKey" });
    if (GITHUB_TOKEN.test(line) || AWS_ACCESS_KEY.test(line) || BEARER_TOKEN.test(line) || hasAssignedSecret(line)) {
      addFinding(findings, { code: "credential", severity: "high", line: lineNumber, messageKey: "publication.safety.credential" });
    }
    if (INTERNAL_ENDPOINT.test(line)) {
      addFinding(findings, { code: "internal_endpoint", severity: "medium", line: lineNumber, messageKey: "publication.safety.internalEndpoint" });
    }
  }
  return { status: findings.length === 0 ? "clear" : "advisory", findings };
}

function hasAssignedSecret(line: string): boolean {
  const match = ASSIGNED_SECRET.exec(line);
  if (!match) return false;
  const value = match[1]!.toLowerCase();
  return !["example", "placeholder", "changeme", "your-secret", "your_token", "dummy", "test-value"].some((marker) => value.includes(marker));
}

function addFinding(findings: SensitiveFinding[], finding: SensitiveFinding): void {
  if (findings.some((existing) => existing.code === finding.code && existing.line === finding.line)) return;
  findings.push(finding);
}
