// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AssetService, type AssetRepositoryPort } from "../../src/assets/service";
import type { AssetRecord, ParseJobRecord } from "../../src/assets/types";

function repository(): AssetRepositoryPort & { assets: AssetRecord[]; jobs: ParseJobRecord[] } {
  const store = {
    assets: [] as AssetRecord[],
    jobs: [] as ParseJobRecord[],
    async findByIdempotency(ownerId: string, idempotencyKey: string) {
      const asset = store.assets.find((item) => item.ownerId === ownerId && item.idempotencyKey === idempotencyKey);
      return asset ? { asset, job: store.jobs.find((item) => item.assetId === asset.id)! } : null;
    },
    async insertAssetWithJob(asset: AssetRecord, job: ParseJobRecord) {
      store.assets.push(asset);
      store.jobs.push(job);
    },
    async findOwned(ownerId: string, assetId: string) {
      const asset = store.assets.find((item) => item.ownerId === ownerId && item.id === assetId);
      return asset ? { asset, job: store.jobs.find((item) => item.assetId === asset.id)! } : null;
    },
    async claimParseJob(assetId: string, _now: string) {
      const job = store.jobs.find((item) => item.assetId === assetId);
      if (!job || !["queued", "failed_retryable"].includes(job.status) || job.attempts >= 3) return null;
      job.status = "processing";
      job.attempts += 1;
      return job;
    },
    async markParseSucceeded(assetId: string, now: string) {
      const job = store.jobs.find((item) => item.assetId === assetId)!;
      job.status = "succeeded";
      job.lastErrorCode = null;
      job.updatedAt = now;
    },
    async markParseFailed(assetId: string, now: string, code: string, terminal: boolean) {
      const job = store.jobs.find((item) => item.assetId === assetId)!;
      job.status = terminal ? "failed_terminal" : "failed_retryable";
      job.lastErrorCode = code;
      job.updatedAt = now;
    },
    async listProcessable(_limit: number) {
      return store.jobs.filter((item) => ["queued", "failed_retryable"].includes(item.status) && item.attempts < 3).map((item) => item.assetId);
    },
    async sumByteSize() {
      return store.assets.reduce((total, item) => total + item.byteSize, 0);
    },
    async isObjectKeyReferenced(objectKey: string) {
      if (store.assets.some((item) => item.objectKey === objectKey)) return true;
      const match = /^parsed\/(.+)\.md$/u.exec(objectKey);
      return Boolean(match && store.jobs.some((item) => item.assetId === match[1] && item.status === "succeeded"));
    },
    async findById(assetId: string) {
      const asset = store.assets.find((item) => item.id === assetId);
      return asset ? { asset, job: store.jobs.find((item) => item.assetId === asset.id)! } : null;
    },
    async cancelOwned(ownerId: string, assetId: string) {
      const assetIndex = store.assets.findIndex((item) => item.ownerId === ownerId && item.id === assetId);
      const asset = assetIndex < 0 ? undefined : store.assets[assetIndex];
      const job = asset ? store.jobs.find((item) => item.assetId === asset.id) : undefined;
      if (!asset || !job || !["queued", "failed_retryable"].includes(job.status)) return null;
      store.assets.splice(assetIndex, 1);
      const jobIndex = store.jobs.findIndex((item) => item.assetId === assetId);
      if (jobIndex >= 0) store.jobs.splice(jobIndex, 1);
      return { objectKey: asset.objectKey };
    },
    async listOwned(ownerId: string, request: { limit: number }) {
      const items = store.assets
        .filter((item) => item.ownerId === ownerId)
        .map((asset) => ({ asset, job: store.jobs.find((item) => item.assetId === asset.id)! }))
        .slice(0, request.limit);
      return { items };
    },
    async listAll(request: { limit: number }) {
      const items = store.assets
        .map((asset) => ({ asset, job: store.jobs.find((item) => item.assetId === asset.id)! }))
        .slice(0, request.limit);
      return { items };
    },
    async listAdminPage(request: { page: number; pageSize: 20 | 50 | 100; status?: ParseJobRecord["status"] }) {
      const all = store.assets.map((asset) => ({ asset, job: store.jobs.find((item) => item.assetId === asset.id)! })).filter((item) => request.status === undefined || item.job.status === request.status);
      const offset = (request.page - 1) * request.pageSize;
      return { items: all.slice(offset, offset + request.pageSize), pagination: { ...request, total: all.length, totalPages: all.length === 0 ? 0 : Math.ceil(all.length / request.pageSize) } };
    },
    async resetParseJob(assetId: string, now: string) {
      const job = store.jobs.find((item) => item.assetId === assetId);
      if (!job || !["failed_retryable", "failed_terminal"].includes(job.status)) return false;
      job.status = "queued";
      job.attempts = 0;
      job.lastErrorCode = null;
      job.updatedAt = now;
      return true;
    },
  };
  return store;
}

function bucket() {
  const objects = new Map<string, ArrayBuffer>();
  return {
    objects,
    put: async (key: string, body: ArrayBuffer | string) => {
      objects.set(key, typeof body === "string" ? new TextEncoder().encode(body).buffer : body);
    },
    get: async (key: string) => {
      const body = objects.get(key);
      return body ? { arrayBuffer: async () => body } : null;
    },
    delete: async (key: string) => { objects.delete(key); },
  } as unknown as R2Bucket & { objects: Map<string, ArrayBuffer> };
}

function orphanBucket() {
  const objects = new Map<string, ArrayBuffer>();
  const uploaded = new Map<string, Date>();
  const current = () => new Date("2026-08-23T00:00:00.000Z");
  return {
    objects,
    add: (key: string, value: string, uploadedAt: string) => {
      objects.set(key, new TextEncoder().encode(value).buffer);
      uploaded.set(key, new Date(uploadedAt));
    },
    put: async (key: string, body: ArrayBuffer | string) => {
      objects.set(key, typeof body === "string" ? new TextEncoder().encode(body).buffer : body);
      uploaded.set(key, current());
    },
    get: async (key: string) => {
      const body = objects.get(key);
      return body ? { arrayBuffer: async () => body } : null;
    },
    head: async (key: string) => {
      const body = objects.get(key);
      const date = uploaded.get(key);
      return body && date ? { key, size: body.byteLength, uploaded: date } : null;
    },
    list: async ({ prefix = "", limit = 1000 }: { prefix?: string; limit?: number } = {}) => {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      const selected = keys.slice(0, limit);
      return {
        objects: selected.map((key) => ({ key, size: objects.get(key)!.byteLength, uploaded: uploaded.get(key)! })),
        truncated: keys.length > selected.length,
      };
    },
    delete: async (key: string) => {
      objects.delete(key);
      uploaded.delete(key);
    },
  } as unknown as R2Bucket & { objects: Map<string, ArrayBuffer>; add: (key: string, value: string, uploadedAt: string) => void };
}

const richFormatMatrix = [
  ["guide.pdf", "application/pdf", Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])],
  ["photo.png", "image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ["photo.jpg", "image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff])],
  ["photo.gif", "image/gif", new TextEncoder().encode("GIF89a")],
  ["photo.webp", "image/webp", Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])],
  ["guide.doc", "application/msword", Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
  ["guide.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Uint8Array.from([0x50, 0x4b, 0x03, 0x04])],
  ["sheet.xls", "application/vnd.ms-excel", Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
  ["sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Uint8Array.from([0x50, 0x4b, 0x03, 0x04])],
  ["deck.ppt", "application/vnd.ms-powerpoint", Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
  ["deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", Uint8Array.from([0x50, 0x4b, 0x03, 0x04])],
  ["document.odt", "application/vnd.oasis.opendocument.text", Uint8Array.from([0x50, 0x4b, 0x03, 0x04])],
  ["workbook.ods", "application/vnd.oasis.opendocument.spreadsheet", Uint8Array.from([0x50, 0x4b, 0x03, 0x04])],
  ["workbook.numbers", "application/vnd.apple.numbers", Uint8Array.from([0x50, 0x4b, 0x03, 0x04])],
] as const;

describe("AssetService", () => {
  it("reports a bounded admin-only capacity snapshot and hides usage in free text mode", async () => {
    const db = repository();
    db.assets.push({
      id: "asset-capacity-1", ownerId: "member-1", objectKey: "staging/asset-capacity-1",
      originalName: "notes.txt", contentType: "text/plain", byteSize: 8 * 1024 * 1024 * 1024,
      contentSha256: "a".repeat(64), idempotencyKey: "capacity-1", status: "ready",
      createdAt: "2026-08-23T00:00:00.000Z", updatedAt: "2026-08-23T00:00:00.000Z",
    });
    const enabled = new AssetService(bucket(), db);
    await expect(enabled.capacity()).resolves.toEqual({
      storageEnabled: true,
      usedBytes: 8 * 1024 * 1024 * 1024,
      maxBytes: 9 * 1024 * 1024 * 1024,
      warningThresholdBytes: 8 * 1024 * 1024 * 1024,
      warning: true,
    });

    await expect(new AssetService(undefined, db).capacity()).resolves.toEqual({
      storageEnabled: false,
      usedBytes: null,
      maxBytes: 9 * 1024 * 1024 * 1024,
      warningThresholdBytes: 8 * 1024 * 1024 * 1024,
      warning: false,
    });
  });

  it("cancels a queued asset before removing its staging object", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, { id: () => "asset-cancel" });
    const created = await service.create({
      ownerId: "member-1", originalName: "cancel.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("cancel me").buffer, idempotencyKey: "cancel-key-0001",
    });

    await expect(service.cancel("member-1", created.asset.id)).resolves.toBeUndefined();
    expect(db.assets).toHaveLength(0);
    expect(db.jobs).toHaveLength(0);
    expect(originals.objects.has(created.asset.objectKey)).toBe(false);
  });

  it("resumes an owned asset by its idempotency key without creating another record", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, { id: () => "asset-resume" });
    const created = await service.create({
      ownerId: "member-1", originalName: "resume.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("resume me").buffer, idempotencyKey: "resume-key-0001",
    });

    await expect(service.resume("member-1", "resume-key-0001")).resolves.toEqual(created);
    await expect(service.resume("member-2", "resume-key-0001")).rejects.toMatchObject({ code: "ASSET_NOT_FOUND", status: 404 });
    await expect(service.resume("member-1", "")).rejects.toMatchObject({ code: "ASSET_RESUME_INVALID", status: 400 });
  });

  it("allows an owner to replace a failed parse with reviewable Markdown", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, { id: () => "asset-alternative" });
    const created = await service.create({
      ownerId: "member-1", originalName: "broken.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer, idempotencyKey: "alternative-key-1",
    });
    db.jobs[0]!.status = "failed_terminal";
    db.jobs[0]!.lastErrorCode = "ASSET_PDF_PARSE_UNSUPPORTED";

    await expect(service.assertAlternativeAllowed("member-1", created.asset.id)).resolves.toMatchObject({
      asset: { id: created.asset.id, ownerId: "member-1" },
      job: { status: "failed_terminal", lastErrorCode: "ASSET_PDF_PARSE_UNSUPPORTED" },
    });
  });

  it.each([
    ["another owner", "member-2", "failed_terminal"],
    ["queued asset", "member-1", "queued"],
    ["succeeded asset", "member-1", "succeeded"],
  ] as const)("rejects alternative text for %s", async (_label, ownerId, status) => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, { id: () => "asset-alternative" });
    const created = await service.create({
      ownerId: "member-1", originalName: "source.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer, idempotencyKey: "alternative-key-2",
    });
    db.jobs[0]!.status = status;

    await expect(service.assertAlternativeAllowed(ownerId, created.asset.id)).rejects.toMatchObject({
      code: status === "failed_terminal" ? "ASSET_NOT_FOUND" : "ASSET_ALTERNATIVE_NOT_ALLOWED",
      status: status === "failed_terminal" ? 404 : 409,
    });
  });

  it("recovers PDF page headings without a paid parser or AI provider", async () => {
    const pdf = `%PDF-1.4\n3 0 obj\n<< /Type /Page /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 35 >>\nstream\nBT\n(Page one text) Tj\nET\nendstream\nendobj\n%%EOF`;
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, { id: () => "asset-pdf-pages" });
    const created = await service.create({
      ownerId: "member-1", originalName: "pages.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode(pdf).buffer, idempotencyKey: "pdf-pages-key",
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "succeeded", lastErrorCode: null });
    const parsed = originals.objects.get(`parsed/${created.asset.id}.md`);
    expect(parsed && new TextDecoder().decode(parsed)).toContain("## Page 1\n\nPage one text");
  });

  it("persists a visible low-confidence warning for image OCR", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      imageConverter: {
        async toMarkdown() {
          return { format: "markdown", data: "> Warning: OCR confidence is low (40%).\n\nDetected label\n" };
        },
      },
    });
    const created = await service.create({
      ownerId: "member-1", originalName: "label.png", contentType: "image/png",
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer,
      idempotencyKey: "image-warning-key",
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "succeeded", lastErrorCode: null });
    const parsed = originals.objects.get(`parsed/${created.asset.id}.md`);
    expect(parsed && new TextDecoder().decode(parsed)).toContain("OCR confidence is low");
  });

  it("fails closed without R2 and does not create a D1 asset", async () => {
    const db = repository();
    const service = new AssetService(undefined, db);

    await expect(service.create({
      ownerId: "member-1",
      originalName: "guide.pdf",
      contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer,
      idempotencyKey: "no-r2-upload",
    })).rejects.toMatchObject({
      code: "ASSET_STORAGE_NOT_CONFIGURED",
      status: 503,
      retryable: false,
    });
    expect(db.assets).toHaveLength(0);
    expect(db.jobs).toHaveLength(0);
  });

  it("stores a bounded private object and queues exactly one parse job", async () => {
    let sequence = 0;
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      id: () => `asset-${++sequence}`,
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });

    const result = await service.create({
      ownerId: "member-1",
      originalName: "guide.pdf",
      contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer,
      idempotencyKey: "upload-key-1",
    });

    expect(result.asset).toMatchObject({
      id: "asset-1",
      ownerId: "member-1",
      originalName: "guide.pdf",
      contentType: "application/pdf",
      byteSize: 9,
      status: "ready",
    });
    expect(result.asset.objectKey).toBe("staging/asset-1");
    expect(result.job).toMatchObject({ assetId: "asset-1", status: "queued", attempts: 0 });
    expect(originals.objects.has("staging/asset-1")).toBe(true);
  });

  it("snapshots an allowed HTTPS URL through the same asset persistence path", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      id: () => "url-asset",
      fetch: async () => new Response("remote notes", { headers: { "content-type": "text/plain" } }),
    });
    const result = await service.createFromUrl("member-1", "https://example.com/notes.txt", "url-key-01");
    expect(result.asset).toMatchObject({ originalName: "notes.txt", contentType: "text/plain", byteSize: 12 });
    expect(new TextDecoder().decode(originals.objects.get("staging/url-asset"))).toBe("remote notes");
  });

  it("replays the same asset without writing a second R2 object", async () => {
    let sequence = 0;
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, { id: () => `asset-${++sequence}` });
    const input = {
      ownerId: "member-1", originalName: "notes.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("notes").buffer, idempotencyKey: "same-key",
    };

    const first = await service.create(input);
    const replay = await service.create(input);

    expect(replay).toEqual(first);
    expect(db.assets).toHaveLength(1);
    expect(originals.objects).toHaveLength(1);
  });

  it("rejects an empty body", async () => {
    const service = new AssetService(bucket(), repository());
    await expect(service.create({
      ownerId: "member-1", originalName: "empty.txt", contentType: "text/plain",
      bytes: new ArrayBuffer(0), idempotencyKey: "key",
    })).rejects.toMatchObject({ code: "ASSET_EMPTY", status: 400 });
  });

  it("rejects a new upload when tracked asset capacity is exhausted", async () => {
    const db = repository();
    const service = new AssetService(bucket(), db, { maxTotalBytes: 10 });
    await service.create({
      ownerId: "member-1", originalName: "existing.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("12345678").buffer, idempotencyKey: "capacity-existing",
    });

    await expect(service.create({
      ownerId: "member-1", originalName: "new.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("1234").buffer, idempotencyKey: "capacity-new",
    })).rejects.toMatchObject({ code: "ASSET_CAPACITY_LIMIT", status: 507, retryable: true });
  });

  it("previews and explicitly reclaims only aged unreferenced R2 objects", async () => {
    const db = repository();
    const originals = orphanBucket();
    const service = new AssetService(originals, db, {
      id: () => "asset-1",
      now: () => new Date("2026-08-23T00:00:00.000Z"),
      orphanGraceMs: 24 * 60 * 60 * 1000,
    });
    await service.create({
      ownerId: "member-1", originalName: "kept.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("kept").buffer, idempotencyKey: "orphan-kept",
    });
    originals.add("staging/orphan-old", "orphan", "2026-08-20T00:00:00.000Z");
    originals.add("staging/orphan-new", "new", "2026-08-22T12:00:00.000Z");

    const preview = await service.previewOrphans({ prefix: "staging/", limit: 10 });

    expect(preview.items).toEqual([{ key: "staging/orphan-old", size: 6, uploadedAt: "2026-08-20T00:00:00.000Z" }]);
    const reclaimed = await service.reclaimOrphans(preview.items.map((item) => item.key));
    expect(reclaimed).toEqual({ deleted: ["staging/orphan-old"], skipped: [] });
    expect(originals.objects.has("staging/orphan-old")).toBe(false);
    expect(originals.objects.has("staging/asset-1")).toBe(true);
    expect(originals.objects.has("staging/orphan-new")).toBe(true);
  });

  it.each([
    ["bad/name.txt", "text/plain", "ASSET_NAME_INVALID", 400],
    ["notes.bin", "application/x-unknown", "ASSET_TYPE_UNSUPPORTED", 415],
    ["guide.pdf", "text/plain", "ASSET_TYPE_MISMATCH", 415],
    ["photo.png", "image/jpeg", "ASSET_TYPE_MISMATCH", 415],
    ["deck.pptx", "application/pdf", "ASSET_TYPE_MISMATCH", 415],
    ["guide.doc", "text/plain", "ASSET_TYPE_MISMATCH", 415],
    ["document.odt", "application/pdf", "ASSET_TYPE_MISMATCH", 415],
    ["workbook.ods", "text/plain", "ASSET_TYPE_MISMATCH", 415],
    ["workbook.numbers", "text/plain", "ASSET_TYPE_MISMATCH", 415],
  ])("rejects invalid upload metadata %s", async (originalName, contentType, code, status) => {
    const service = new AssetService(bucket(), repository());
    await expect(service.create({
      ownerId: "member-1", originalName, contentType,
      bytes: new TextEncoder().encode("body").buffer, idempotencyKey: "key",
    })).rejects.toMatchObject({ code, status });
  });

  it("deletes the R2 object when the D1 insert fails", async () => {
    const originals = bucket();
    const db = repository();
    db.insertAssetWithJob = async () => { throw new Error("d1 unavailable"); };
    const service = new AssetService(originals, db);

    await expect(service.create({
      ownerId: "member-1", originalName: "notes.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("body").buffer, idempotencyKey: "key",
    })).rejects.toMatchObject({ code: "ASSET_PERSISTENCE_UNAVAILABLE", status: 503, retryable: true });
    expect(originals.objects.size).toBe(0);
  });

  it("parses a text original into a private Markdown object and completes its job", async () => {
    let sequence = 0;
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      id: () => `asset-${++sequence}`,
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });
    await service.create({
      ownerId: "member-1", originalName: "notes.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("hello *world*").buffer, idempotencyKey: "parse-key",
    });

    const result = await service.process("member-1", "asset-1");

    expect(result.job).toMatchObject({ status: "succeeded", attempts: 1, lastErrorCode: null });
    expect(new TextDecoder().decode(originals.objects.get("parsed/asset-1.md"))).toContain("hello \\*world\\*");
  });

  it("marks an unsupported original as a terminal parse failure", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db);
    const created = await service.create({
      ownerId: "member-1", originalName: "guide.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer, idempotencyKey: "pdf-key",
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "failed_terminal", lastErrorCode: "ASSET_PDF_PARSE_UNSUPPORTED" });
    expect(originals.objects.has(`parsed/${created.asset.id}.md`)).toBe(false);
  });

  it("uses a local Markdown conversion provider for rich originals", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      markdownConverter: {
        async toMarkdown() {
          return { format: "markdown", data: "# Converted PDF\\n\\nReadable content\\n" };
        },
      },
    });
    const created = await service.create({
      ownerId: "member-1", originalName: "guide.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer, idempotencyKey: "pdf-convert-key",
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "succeeded", lastErrorCode: null });
    const converted = originals.objects.get(`parsed/${created.asset.id}.md`);
    expect(converted).toBeDefined();
    expect(new TextDecoder().decode(converted)).toContain("# Converted PDF");
  });

  it.each(richFormatMatrix)("marks an empty conversion terminal for %s", async (originalName, contentType, payload) => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      markdownConverter: { async toMarkdown() { return { format: "markdown", data: "\n  \n" }; } },
    });
    const created = await service.create({
      ownerId: "member-1", originalName, contentType,
      bytes: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
      idempotencyKey: `empty-${originalName}`,
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "failed_terminal", lastErrorCode: "SOURCE_EMPTY" });
    expect(originals.objects.has(`parsed/${created.asset.id}.md`)).toBe(false);
  });

  it.each(richFormatMatrix)("keeps conversion provider failure retryable for %s", async (originalName, contentType, payload) => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      markdownConverter: { async toMarkdown() { throw new Error("provider unavailable"); } },
    });
    const created = await service.create({
      ownerId: "member-1", originalName, contentType,
      bytes: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
      idempotencyKey: `retry-${originalName}`,
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "failed_retryable", lastErrorCode: "ASSET_AI_PARSE_FAILED" });
  });

  it.each([
    ["guide.pdf", "application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]],
    ["photo.png", "image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["photo.jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["photo.gif", "image/gif", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    ["photo.webp", "image/webp", [0x52, 0x49, 0x46, 0x46, 0x31, 0x32, 0x33, 0x34, 0x57, 0x45, 0x42, 0x50]],
    ["guide.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", [0x50, 0x4b, 0x03, 0x04]],
    ["guide.doc", "application/msword", [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
    ["sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [0x50, 0x4b, 0x03, 0x04]],
    ["deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", [0x50, 0x4b, 0x03, 0x04]],
    ["sheet.xls", "application/vnd.ms-excel", [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
    ["deck.ppt", "application/vnd.ms-powerpoint", [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
    ["document.odt", "application/vnd.oasis.opendocument.text", [0x50, 0x4b, 0x03, 0x04]],
    ["workbook.ods", "application/vnd.oasis.opendocument.spreadsheet", [0x50, 0x4b, 0x03, 0x04]],
    ["workbook.numbers", "application/vnd.apple.numbers", [0x50, 0x4b, 0x03, 0x04]],
  ])("accepts a valid binary signature for %s", async (originalName, contentType, payload) => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      markdownConverter: { async toMarkdown() { return { format: "markdown", data: "# Converted\n" }; } },
    });
    const created = await service.create({
      ownerId: "member-1", originalName, contentType,
      bytes: Uint8Array.from(payload).buffer, idempotencyKey: `matrix-${originalName}`,
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "succeeded", lastErrorCode: null });
  });

  it("rejects a corrupt PDF before invoking rich conversion", async () => {
    const db = repository();
    const originals = bucket();
    let conversions = 0;
    const service = new AssetService(originals, db, {
      markdownConverter: {
        async toMarkdown() {
          conversions += 1;
          return { format: "markdown", data: "# Should not run\n" };
        },
      },
    });
    const created = await service.create({
      ownerId: "member-1", originalName: "broken.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode("not a PDF").buffer, idempotencyKey: "corrupt-pdf-key",
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "failed_terminal", lastErrorCode: "ASSET_CONTENT_INVALID" });
    expect(conversions).toBe(0);
  });

  it("keeps a rich conversion provider failure retryable", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      markdownConverter: { async toMarkdown() { throw new Error("provider unavailable"); } },
    });
    const created = await service.create({
      ownerId: "member-1", originalName: "guide.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer, idempotencyKey: "pdf-failure-key",
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "failed_retryable", lastErrorCode: "ASSET_AI_PARSE_FAILED" });
  });

  it("times out a slow conversion, cleans the parsed artifact, and retries idempotently", async () => {
    const db = repository();
    const originals = bucket();
    let available = false;
    const service = new AssetService(originals, db, {
      id: () => "asset-timeout",
      parseTimeoutMs: 5,
      markdownConverter: {
        async toMarkdown() {
          if (!available) await new Promise((resolve) => setTimeout(resolve, 20));
          return { format: "markdown", data: "# recovered\n" };
        },
      },
    });
    const created = await service.create({
      ownerId: "member-1", originalName: "slow.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer, idempotencyKey: "timeout-key",
    });
    originals.objects.set(`parsed/${created.asset.id}.md`, new TextEncoder().encode("stale output").buffer);

    const timedOut = await service.process("member-1", created.asset.id);
    expect(timedOut.job).toMatchObject({ status: "failed_retryable", attempts: 1, lastErrorCode: "ASSET_PARSE_TIMEOUT" });
    expect(originals.objects.has(`parsed/${created.asset.id}.md`)).toBe(false);

    available = true;
    await expect(service.retry(created.asset.id)).resolves.toMatchObject({
      job: { status: "queued", attempts: 0, lastErrorCode: null },
    });
    const recovered = await service.process("member-1", created.asset.id);
    expect(recovered.job).toMatchObject({ status: "succeeded", attempts: 1, lastErrorCode: null });
    expect(new TextDecoder().decode(originals.objects.get(`parsed/${created.asset.id}.md`))).toContain("# recovered");
    expect(originals.objects.size).toBe(2);
  });

  it("reclaims a retryable AI failure on the next bounded sweep after recovery", async () => {
    const db = repository();
    const originals = bucket();
    let available = false;
    const service = new AssetService(originals, db, {
      id: (() => { let sequence = 0; return () => `asset-recovery-${++sequence}`; })(),
      markdownConverter: {
        async toMarkdown() {
          if (!available) throw new Error("provider unavailable");
          return { format: "markdown", data: "# recovered\n" };
        },
      },
    });
    const created = await service.create({
      ownerId: "member-1", originalName: "recover.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer, idempotencyKey: "ai-recovery-key",
    });

    const first = await service.process("member-1", created.asset.id);
    expect(first.job).toMatchObject({ status: "failed_retryable", attempts: 1, lastErrorCode: "ASSET_AI_PARSE_FAILED" });

    available = true;
    await expect(service.processDue(1)).resolves.toEqual({ attempted: 1, succeeded: 1 });
    await expect(service.getOwned("member-1", created.asset.id)).resolves.toMatchObject({
      job: { status: "succeeded", attempts: 2, lastErrorCode: null },
    });
  });

  it("marks an empty rich conversion as a terminal source failure", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      markdownConverter: { async toMarkdown() { return { format: "markdown", data: "\n  \n" }; } },
    });
    const created = await service.create({
      ownerId: "member-1", originalName: "empty.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer, idempotencyKey: "empty-rich-key",
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "failed_terminal", lastErrorCode: "SOURCE_EMPTY" });
  });

  it("marks an oversized rich conversion as a terminal source failure", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      markdownConverter: { async toMarkdown() { return { format: "markdown", data: "x".repeat(128 * 1024) }; } },
    });
    const created = await service.create({
      ownerId: "member-1", originalName: "large.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer, idempotencyKey: "large-rich-key",
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "failed_terminal", lastErrorCode: "SOURCE_TOO_LARGE" });
    expect(originals.objects.has(created.asset.objectKey)).toBe(true);
    expect(originals.objects.has(`parsed/${created.asset.id}.md`)).toBe(false);
  });

  it("marks malformed UTF-8 text as a terminal parse failure", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db);
    const created = await service.create({
      ownerId: "member-1", originalName: "broken.txt", contentType: "text/plain",
      bytes: new Uint8Array([0xc3, 0x28]).buffer, idempotencyKey: "broken-key",
    });

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "failed_terminal", lastErrorCode: "ASSET_CONTENT_INVALID" });
  });

  it("keeps a missing R2 original retryable", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, { id: () => "asset-missing-original" });
    const created = await service.create({
      ownerId: "member-1", originalName: "notes.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("recover me").buffer, idempotencyKey: "missing-original-key",
    });
    originals.objects.delete(created.asset.objectKey);

    const result = await service.process("member-1", created.asset.id);

    expect(result.job).toMatchObject({ status: "failed_retryable", lastErrorCode: "ASSET_ORIGINAL_MISSING" });
  });

  it("automatically processes only the bounded set of due parse jobs", async () => {
    let sequence = 0;
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      id: () => `asset-${++sequence}`,
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });
    await service.create({
      ownerId: "member-1", originalName: "notes.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("scheduled").buffer, idempotencyKey: "scheduled-key",
    });

    await expect(service.processDue(1)).resolves.toEqual({ attempted: 1, succeeded: 1 });
    expect((await service.getOwned("member-1", "asset-1")).job.status).toBe("succeeded");
  });

  it("downloads an owned original with its stored media type", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, { id: () => "asset-download" });
    await service.create({
      ownerId: "member-1", originalName: "guide.pdf", contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n").buffer, idempotencyKey: "download-key",
    });

    const result = await service.download("member-1", "asset-download", "original");

    expect(new TextDecoder().decode(result.body)).toBe("%PDF-1.7\n");
    expect(result.contentType).toBe("application/pdf");
    expect(result.filename).toBe("guide.pdf");
  });

  it("downloads a parsed result only after the job succeeds", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, { id: () => "asset-parsed" });
    await service.create({
      ownerId: "member-1", originalName: "notes.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("notes").buffer, idempotencyKey: "parsed-key",
    });

    await expect(service.download("member-1", "asset-parsed", "parsed"))
      .rejects.toMatchObject({ code: "ASSET_RESULT_NOT_READY", status: 409, retryable: true });

    await service.process("member-1", "asset-parsed");
    const result = await service.download("member-1", "asset-parsed", "parsed");

    expect(result.contentType).toBe("text/markdown; charset=utf-8");
    expect(result.filename).toBe("notes.md");
    expect(new TextDecoder().decode(result.body)).toContain("notes");
  });

  it("does not reveal another owner's original or a missing parsed object", async () => {
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, { id: () => "asset-private" });
    await service.create({
      ownerId: "member-1", originalName: "notes.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("notes").buffer, idempotencyKey: "private-key",
    });

    await expect(service.download("member-2", "asset-private", "original"))
      .rejects.toMatchObject({ code: "ASSET_NOT_FOUND", status: 404 });
    await service.process("member-1", "asset-private");
    originals.objects.delete("parsed/asset-private.md");
    await expect(service.download("member-1", "asset-private", "parsed"))
      .rejects.toMatchObject({ code: "ASSET_RESULT_MISSING", status: 503, retryable: true });
  });

  it("lists only the owner's assets with bounded pagination", async () => {
    let sequence = 0;
    const db = repository();
    const service = new AssetService(bucket(), db, { id: () => `asset-list-${++sequence}` });
    for (const name of ["one.txt", "two.txt", "other.txt"]) {
      await service.create({
        ownerId: name === "other.txt" ? "member-2" : "member-1",
        originalName: name,
        contentType: "text/plain",
        bytes: new TextEncoder().encode(name).buffer,
        idempotencyKey: name,
      });
    }

    const result = await service.listOwned("member-1", { limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.asset.ownerId).toBe("member-1");
  });
});
