import type { ConsumeInput } from "./authority.ts";

/** Construct only from operator-installed issuer configuration, not web messages.
 * No redirects, credentials, discovery, retry or configurable request endpoint.
 * TLS validation remains the platform default. Never log the request or response.
 */
export function createConnectorConsumeClient(options: { issuerOrigin: string; fetch?: typeof fetch }) {
  const origin = options.issuerOrigin;
  if (new URL(origin).origin !== origin || !origin.startsWith("https://")) throw new Error("Invalid issuer origin");
  const endpoint = `${origin}/api/connector/consume`;
  const send = options.fetch ?? globalThis.fetch;
  return async (input: ConsumeInput, signal: AbortSignal): Promise<unknown> => {
    if (!input || Object.keys(input).sort().join(",") !== "consumerId,ticket,ticketId"
      || typeof input.ticket !== "string" || input.ticket.length < 1 || input.ticket.length > 8192
      || ![input.ticketId, input.consumerId].every(value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value))) {
      throw new Error("Invalid consumption request");
    }
    if (signal.aborted) throw new Error("Consumption canceled");
    const abort = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let rejectCanceled: () => void = () => {};
    const canceled = new Promise<never>((_, reject) => { rejectCanceled = () => reject(new Error("Consumption canceled")); });
    const cancel = () => { abort.abort(); rejectCanceled(); if (reader) void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 5_000);
    try {
      const request = new Request(endpoint, {
        method: "POST", body: JSON.stringify(input), signal: abort.signal,
        headers: { "content-type": "application/json", accept: "application/json" },
        // Manual never follows a redirect; the strict 201 check below rejects every 3xx.
        credentials: "omit", redirect: "manual", cache: "no-store", referrerPolicy: "no-referrer",
      });
      const read = async () => {
        const response = await send(request);
        if (abort.signal.aborted || response.status !== 201 || response.redirected
          || (response.url && response.url !== endpoint)
          || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
          || !response.body) {
          void response.body?.cancel().catch(() => {});
          throw new Error("Consumption rejected");
        }
        reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let length = 0, reads = 0;
        while (!abort.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (++reads > 4096 || length > 4096) throw new Error("Invalid consumption response");
          if (value.byteLength) chunks.push(value);
        }
        if (abort.signal.aborted) throw new Error("Consumption canceled");
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
      };
      return await Promise.race([read(), canceled]);
    } finally {
      clearTimeout(timer); signal.removeEventListener("abort", cancel);
      abort.abort(); if (reader) void reader.cancel().catch(() => {});
    }
  };
}
