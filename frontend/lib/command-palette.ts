import type { SessionSnapshot } from "../contracts/api";
import { ROUTES } from "../contracts/routes";
import { routeAccessAllowed } from "./route-access";

export interface CommandPaletteItem {
  id: string;
  labelKey: string;
  keywords: readonly string[];
  href?: string;
  action?: "create-note" | "create-task" | "ask-ai" | "toggle-theme" | "logout";
  capability?: string;
}

const COMMANDS: readonly CommandPaletteItem[] = [
  { id: "capture-knowledge", labelKey: "WORKBENCH_QUICK_SUBMIT", keywords: ["capture", "submit", "note", "knowledge", "收集", "知识"], href: "/submit", action: "create-note", capability: "submission:create" },
  { id: "open-tasks", labelKey: "WORKBENCH_QUICK_TASKS", keywords: ["task", "todo", "work", "任务", "待办"], href: "/tasks", action: "create-task", capability: "workspace.tasks" },
  { id: "open-boards", labelKey: "NAV_BOARDS", keywords: ["board", "kanban", "看板"], href: "/boards", capability: "workspace.tasks" },
  { id: "open-inbox", labelKey: "NAV_INBOX", keywords: ["inbox", "capture", "收集", "收集箱"], href: "/inbox", capability: "workspace.tasks" },
  { id: "ask-ai", labelKey: "WORKBENCH_QUICK_AI", keywords: ["ai", "agent", "copilot", "assistant", "智能", "问答"], href: "/agent", action: "ask-ai", capability: "knowledge:read" },
  { id: "search-knowledge", labelKey: "WORKBENCH_QUICK_SEARCH", keywords: ["search", "find", "knowledge", "搜索", "查找"], href: "/search", capability: "knowledge:read" },
  { id: "open-knowledge", labelKey: "HOME_OPEN_KNOWLEDGE", keywords: ["library", "knowledge", "kb", "知识库", "库"], href: "/knowledge", capability: "knowledge:read" },
  { id: "open-notifications", labelKey: "NAV_NOTIFICATIONS", keywords: ["notifications", "alerts", "通知"], href: "/notifications" },
  { id: "open-messages", labelKey: "NAV_MESSAGES", keywords: ["messages", "discussion", "消息", "讨论"], href: "/messages" },
  { id: "open-settings", labelKey: "SHELL_SETTINGS", keywords: ["settings", "preferences", "设置", "偏好"], href: "/settings" },
  { id: "toggle-theme", labelKey: "SHELL_THEME", keywords: ["theme", "dark", "light", "主题", "深色", "浅色"], action: "toggle-theme" },
  { id: "logout", labelKey: "SHELL_LOGOUT", keywords: ["logout", "sign out", "退出", "登出"], action: "logout" },
];

export function filterCommands(items: readonly CommandPaletteItem[], query: string, label: (key: string) => string = (key) => key): CommandPaletteItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...items];
  return items.filter((item) => [item.id, item.labelKey, label(item.labelKey), ...item.keywords].some((value) => value.toLocaleLowerCase().includes(normalized)));
}

export function defaultCommands(session: SessionSnapshot): readonly CommandPaletteItem[] {
  return COMMANDS.filter((command) => {
    if (!command.href) return true;
    const route = ROUTES.find((item) => item.path === command.href);
    if (!route) return false;
    return routeAccessAllowed(session, route);
  });
}
