export interface OriginalValidationInput {
  assetId: string;
  objectKey: string;
  expectedByteSize: number;
  expectedSha256: string;
  observed: { exists: boolean; byteSize?: number; sha256?: string };
}

export interface OriginalValidationReport {
  status: "ok" | "degraded" | "unbound";
  checked: number;
  statuses: Array<{ assetId: string; objectKey: string; status: "ok" | "missing" | "size_mismatch" | "hash_mismatch" | "unverified" }>;
  deletions: 0;
}

export function buildOriginalValidationReport(inputs: readonly OriginalValidationInput[], options: { storage?: "bound" | "unbound" } = {}): OriginalValidationReport {
  if (options.storage === "unbound") return { status: "unbound", checked: 0, statuses: [], deletions: 0 };
  if (inputs.length > 1_000) throw new RangeError("Original validation batch is too large");
  const statuses = inputs.map((input) => {
    validateInput(input);
    if (!input.observed.exists) return { assetId: input.assetId, objectKey: input.objectKey, status: "missing" as const };
    if (input.observed.byteSize !== input.expectedByteSize) return { assetId: input.assetId, objectKey: input.objectKey, status: "size_mismatch" as const };
    if (input.observed.sha256 === undefined) return { assetId: input.assetId, objectKey: input.objectKey, status: "unverified" as const };
    if (input.observed.sha256 !== input.expectedSha256) return { assetId: input.assetId, objectKey: input.objectKey, status: "hash_mismatch" as const };
    return { assetId: input.assetId, objectKey: input.objectKey, status: "ok" as const };
  });
  return { status: statuses.every((item) => item.status === "ok") ? "ok" : "degraded", checked: statuses.length, statuses, deletions: 0 };
}

function validateInput(input: OriginalValidationInput): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(input.assetId)
    || !/^[A-Za-z0-9][A-Za-z0-9_./-]{0,255}$/u.test(input.objectKey)
    || !Number.isSafeInteger(input.expectedByteSize) || input.expectedByteSize <= 0
    || !/^[a-f0-9]{64}$/u.test(input.expectedSha256)) throw new TypeError("Original validation metadata is invalid");
}
