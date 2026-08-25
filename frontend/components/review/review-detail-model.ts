export interface ReviewDetailModel {
  readonly id: string;
  readonly title: string;
  readonly submitter: string;
  readonly status: string;
  readonly content: string;
  readonly warnings: readonly string[];
}

export function reviewDetailModel(input: unknown): ReviewDetailModel | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id || !/^[A-Za-z0-9_-]+$/u.test(id)) return null;
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : "Untitled submission";
  const submitter = typeof value.submitter === "string" && value.submitter.trim() ? value.submitter.trim() : "Submitter unavailable";
  const status = typeof value.status === "string" && value.status.trim() ? value.status.trim() : "Status unavailable";
  const content = typeof value.content === "string" ? value.content : "";
  const warnings = Array.isArray(value.warnings) ? value.warnings.filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0).map((warning) => warning.trim()).slice(0, 20) : [];
  return Object.freeze({ id, title, submitter, status, content, warnings });
}
