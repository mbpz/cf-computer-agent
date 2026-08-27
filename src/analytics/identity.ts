export async function dailyVisitorHash(request: Request, day: string): Promise<string> {
  const ip = externalIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown-agent";
  const input = new TextEncoder().encode(`${day}\n${ip}\n${userAgent}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface VisitDimensions {
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
  colo: string | null;
  userAgent: string | null;
}

/**
 * Extracts Cloudflare request dimensions while keeping the stored address
 * coarse enough for a private workspace dashboard. The raw address is never
 * returned by the analytics API.
 */
export function visitDimensions(request: Request): VisitDimensions {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf;
  const read = (header: string, cfKey: string): string | null => {
    const value = request.headers.get(header) || (typeof cf?.[cfKey] === "string" ? cf[cfKey] as string : "");
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : null;
  };
  return {
    ip: maskIp(externalIp(request)),
    country: read("cf-ipcountry", "country"),
    region: read("cf-region", "region"),
    city: read("cf-ipcity", "city"),
    colo: read("cf-colo", "colo"),
    userAgent: (() => {
      const value = request.headers.get("user-agent")?.trim() || "";
      return value.length > 0 ? value.slice(0, 256) : null;
    })(),
  };
}

export function externalIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
    || "unknown-ip";
}

function maskIp(value: string): string {
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u);
  if (ipv4 && ipv4.slice(1).every((part) => Number(part) <= 255)) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0`;
  if (value.includes(":")) {
    const parts = value.split(":").filter(Boolean).slice(0, 4);
    return parts.length > 0 ? `${parts.join(":")}::` : "unknown";
  }
  return "unknown";
}
