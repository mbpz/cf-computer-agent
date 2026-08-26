export async function dailyVisitorHash(request: Request, day: string): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() || "unknown-ip";
  const userAgent = request.headers.get("user-agent") || "unknown-agent";
  const input = new TextEncoder().encode(`${day}\n${ip}\n${userAgent}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
