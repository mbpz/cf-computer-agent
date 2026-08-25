import { describe, expect, it } from "vitest";
import { fetchUrlSnapshot, validateSnapshotUrl } from "../../src/assets/url-snapshot";

const response = (body: string, status = 200, headers: Record<string, string> = { "content-type": "text/html" }) => new Response(body, { status, headers });

describe("URL snapshots", () => {
  it.each(["http://example.com", "https://localhost/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "https://example.com:8443/x", "https://user:pass@example.com/x"])('rejects unsafe URL %s', (value) => {
    expect(() => validateSnapshotUrl(value)).toThrowError(expect.objectContaining({ code: expect.stringMatching(/ASSET_URL_/u) }));
  });

  it("follows only bounded, revalidated HTTPS redirects and returns a sanitized name", async () => {
    const seen: string[] = [];
    const result = await fetchUrlSnapshot("https://example.com/start", async (input) => {
      seen.push(String(input));
      return seen.length === 1
        ? response("", 302, { location: "https://example.com/docs/guide.html" })
        : response("<h1>Guide</h1>");
    });
    expect(seen).toEqual(["https://example.com/start", "https://example.com/docs/guide.html"]);
    expect(result).toMatchObject({ finalUrl: "https://example.com/docs/guide.html", originalName: "guide.html", contentType: "text/html" });
  });

  it("rejects redirect to a blocked host, unsupported types, and streamed over-limit bodies", async () => {
    await expect(fetchUrlSnapshot("https://example.com/start", async () => response("", 302, { location: "http://127.0.0.1/private" })))
      .rejects.toMatchObject({ code: "ASSET_URL_INVALID" });
    await expect(fetchUrlSnapshot("https://example.com/file", async () => response("x", 200, { "content-type": "application/octet-stream" })))
      .rejects.toMatchObject({ code: "ASSET_URL_TYPE_UNSUPPORTED" });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(8)); controller.close(); },
    });
    await expect(fetchUrlSnapshot("https://example.com/file", async () => new Response(stream, { headers: { "content-type": "text/plain" } }), { maxBytes: 4 }))
      .rejects.toMatchObject({ code: "ASSET_TOO_LARGE" });
  });
});
