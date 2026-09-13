import { describe, expect, it } from "vitest";
import { defaultCommands, filterCommands, type CommandPaletteItem } from "../../frontend/lib/command-palette";

const commands: CommandPaletteItem[] = [
  { id: "capture", labelKey: "WORKBENCH_QUICK_SUBMIT", keywords: ["capture", "知识"] },
  { id: "tasks", labelKey: "WORKBENCH_QUICK_TASKS", keywords: ["tasks", "待办"] },
  { id: "ai", labelKey: "WORKBENCH_QUICK_AI", keywords: ["copilot"] },
];

describe("command palette model", () => {
  it("matches the translated visible label, not only internal keys and keywords", () => {
    const labels: Record<string, string> = { WORKBENCH_QUICK_SUBMIT: "快速记录", WORKBENCH_QUICK_TASKS: "新建任务", WORKBENCH_QUICK_AI: "询问助手" };
    expect(filterCommands(commands, "快速记录", (key) => labels[key] ?? key).map((item) => item.id)).toEqual(["capture"]);
  });
  it("filters case-insensitively by id, label key, and localized keywords while preserving order", () => {
    expect(filterCommands(commands, "COPILOT").map((item) => item.id)).toEqual(["ai"]);
    expect(filterCommands(commands, "知识").map((item) => item.id)).toEqual(["capture"]);
    expect(filterCommands(commands, "").map((item) => item.id)).toEqual(["capture", "tasks", "ai"]);
  });

  it("filters task commands by the existing permission mask without exposing admin routes", () => {
    const contributor = { member: { id: "m1", email: "m@example.com", role: "contributor" as const }, capabilities: ["knowledge:read", "submission:create"], permissionMask: "0x0", logoutUrl: "/auth/logout" };
    const taskMember = { ...contributor, permissionMask: "0x100000" };
    expect(defaultCommands(contributor).map((item) => item.id)).not.toContain("open-tasks");
    expect(defaultCommands(taskMember).map((item) => item.id)).toContain("open-tasks");
    expect(defaultCommands(taskMember).map((item) => item.id)).toContain("open-boards");
    expect(defaultCommands(contributor).map((item) => item.id)).not.toContain("open-boards");
    expect(defaultCommands(taskMember).map((item) => item.id)).not.toContain("open-admin");
  });

  it("keeps stable actions available for every signed-in member", () => {
    const session = { member: { id: "m1", email: "m@example.com", role: "contributor" as const }, capabilities: [], logoutUrl: "/auth/logout" };
    const ids = defaultCommands(session).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(["toggle-theme", "logout", "open-settings"]));
  });
});
