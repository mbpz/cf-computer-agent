export function canonicalEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !/^[\x21-\x7e]+$/u.test(email)) return undefined;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@") || at === email.length - 1 || at > 64) return undefined;
  const domainLabels = email.slice(at + 1).split(".");
  if (domainLabels.length < 2 || domainLabels.some((label) => label.length === 0)) return undefined;
  return email;
}
