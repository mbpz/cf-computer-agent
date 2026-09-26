import type { Fetcher } from "./api";
/** Same-origin binary transport. 100% here means bytes sent, not server acceptance. */
export function xhrUploadRequester(onProgress: (loaded: number, total: number) => void, factory: () => XMLHttpRequest = () => new XMLHttpRequest()): Fetcher {
  return (input, init = {}) => new Promise((resolve, reject) => {
    if (init.signal?.aborted) { reject(new DOMException("Upload stopped", "AbortError")); return; }
    const xhr = factory(); let settled = false;
    const cleanup = () => { init.signal?.removeEventListener("abort", abort); xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null; xhr.upload.onprogress = null; };
    const fail = (error: Error) => { if (settled) return; settled = true; cleanup(); reject(error); };
    const abort = () => { xhr.abort(); fail(new DOMException("Upload stopped", "AbortError")); };
    try {
      // This adapter is deliberately not a general-purpose cross-origin requester.
      if (String(input) !== "/api/assets" || init.method !== "POST") throw Error("ASSET_TRANSPORT_TARGET_INVALID");
      xhr.open("POST", "/api/assets", true); xhr.timeout = 120_000;
      new Headers(init.headers).forEach((value, name) => xhr.setRequestHeader(name, value));
      xhr.upload.onprogress = event => { if (!settled && event.lengthComputable) onProgress(event.loaded, event.total); };
      xhr.onload = () => {
        if (settled) return;
        try {
          const headers = new Headers();
          for (const line of xhr.getAllResponseHeaders().split(/\r?\n/u)) { const colon = line.indexOf(":"); if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim()); }
          const response = new Response(xhr.status === 204 ? null : xhr.responseText, { status: xhr.status, headers });
          settled = true; cleanup(); resolve(response);
        } catch (error) { fail(error instanceof Error ? error : Error("ASSET_RESPONSE_INVALID")); }
      };
      xhr.onerror = () => fail(Error("ASSET_NETWORK_ERROR")); xhr.ontimeout = () => fail(Error("ASSET_NETWORK_TIMEOUT")); xhr.onabort = () => fail(new DOMException("Upload stopped", "AbortError"));
      init.signal?.addEventListener("abort", abort, { once: true });
      xhr.send(init.body as XMLHttpRequestBodyInit | null | undefined);
    } catch (error) { fail(error instanceof Error ? error : Error("ASSET_TRANSPORT_ERROR")); }
  });
}
