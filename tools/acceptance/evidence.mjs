import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const registry = JSON.parse(await readFile(new URL("../../config/acceptance/cases.json", import.meta.url), "utf8"));
export const digest = (data) => createHash("sha256").update(data).digest("hex");
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const sha256 = /^[0-9a-f]{64}$/u;
const production = "https://memory.crgmhrc.asia";
const grades = new Set(["engineering", "isolated-ego", "production-ego"]);
const statuses = new Set(["pass", "fail", "blocked", "not-run"]);
export function requireThat(condition, message) { if (!condition) throw new Error(message); }
const text = (value) => typeof value === "string" && value.trim().length > 0;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const matches = (pattern, value) => typeof value === "string" && pattern.test(value);
const date = (value) => text(value) && Number.isFinite(Date.parse(value));

// Validates structure and integrity, not authorship, release-provider receipt truth or sign-off.
export async function verifyReport(path) {
  const reportFile = await realpath(path);
  const root = dirname(reportFile);
  const reportStat = await stat(reportFile);
  requireThat(reportStat.isFile() && reportStat.size <= 1024 * 1024, "Expected a report file no larger than 1 MiB");
  const { schemaVersion, candidate, run, results } = JSON.parse(await readFile(reportFile, "utf8"));
  requireThat(schemaVersion === 1 && object(candidate) && object(run) && Array.isArray(results) && results.length > 0, "Invalid report envelope");
  requireThat(typeof candidate.sourceSha === "string" && /^[0-9a-f]{40}$/u.test(candidate.sourceSha), "Full candidate source SHA required");
  for (const key of ["workerSha256", "assetsSha256", "migrationsSha256"]) requireThat(matches(sha256, candidate[key]), `Candidate ${key} required`);
  const candidateId = digest(JSON.stringify([candidate.sourceSha, candidate.workerSha256, candidate.assetsSha256, candidate.migrationsSha256]));
  requireThat(run.candidateId === candidateId && matches(uuid, run.runId) && grades.has(run.target), "Run/candidate/target mismatch");
  requireThat(date(run.observedAt) && text(run.fixtureVersion), "Run timestamp and fixture version required");
  if (run.target !== "engineering") {
    const deployment = run.deployment;
    requireThat(text(candidate.buildId) && object(deployment) && matches(uuid, deployment.versionId) && matches(uuid, deployment.deploymentId), "Build, version and deployment IDs required; asset filename is not a deployment ID");
    requireThat(text(deployment.origin), "Deployment origin required");
    const url = new URL(deployment.origin);
    requireThat(url.protocol === "https:" && deployment.origin === url.origin && ((url.origin === production) === (run.target === "production-ego")), "Target origin mismatch");
    requireThat(deployment.candidateId === candidateId && matches(sha256, deployment.bindingSha256) && Number.isFinite(deployment.trafficPercent) && deployment.trafficPercent > 0 && deployment.trafficPercent <= 100, "Deployment/candidate/binding/traffic mismatch");
    requireThat(text(run.egoVersion) && text(run.egoTask), "Ego version and task reference required");
  } else requireThat(run.deployment === undefined, "Local run cannot assert a deployment");

  const seen = new Set();
  for (const result of results) {
    requireThat(object(result) && typeof result.id === "string" && Object.hasOwn(registry.cases, result.id) && !seen.has(result.id), "Unknown or duplicate scenario");
    seen.add(result.id);
    const scenario = registry.cases[result.id];
    requireThat(result.runId === run.runId && result.candidateId === candidateId && result.target === run.target && scenario.target === run.target, `${result.id}: run/candidate/evidence level mismatch`);
    requireThat(result.deploymentId === run.deployment?.deploymentId && result.method === scenario.method && statuses.has(result.status), `${result.id}: deployment/method/status mismatch`);
    requireThat(text(result.expected) && text(result.observed), `${result.id}: expected/observed required`);
    if (result.status !== "pass") requireThat(text(result.nextOwner) && text(result.rerun), `${result.id}: next owner and rerun entry required`);
    requireThat(Array.isArray(result.artifacts), `${result.id}: artifacts required`);
    const kinds = new Set();
    for (const artifact of result.artifacts) {
      requireThat(object(artifact) && scenario.requires.includes(artifact.kind) && !kinds.has(artifact.kind) && text(artifact.path) && !isAbsolute(artifact.path) && matches(sha256, artifact.sha256), `${result.id}: invalid artifact reference`);
      const file = await realpath(resolve(root, artifact.path));
      const location = relative(root, file);
      requireThat(location && location !== ".." && !location.startsWith(`..${sep}`) && file !== reportFile, `${result.id}: artifact must be a separate file inside the report directory`);
      const artifactStat = await stat(file);
      requireThat(artifactStat.isFile() && artifactStat.size <= 32 * 1024 * 1024, `${result.id}: expected an artifact file no larger than 32 MiB`);
      requireThat(digest(await readFile(file)) === artifact.sha256, `${result.id}: artifact digest mismatch`);
      kinds.add(artifact.kind);
    }
    if (result.status === "pass") requireThat(scenario.requires.every((kind) => kinds.has(kind)), `${result.id}: mandatory evidence missing`);
  }
  return { candidateId, runId: run.runId, verifiedResults: seen.size, closureAllowed: false, closureReason: "Evidence validation is not product/release policy approval. No checklist status changed." };
}
