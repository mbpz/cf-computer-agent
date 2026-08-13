export interface BrowserSession {
  member: { id: string; email: string; role: "admin" | "contributor" };
  capabilities: readonly string[];
}

export interface NavigationItem {
  href: string;
  label: string;
  group: "workspace" | "admin";
}

export function navigationForSession(session: BrowserSession | null | undefined): readonly NavigationItem[];
