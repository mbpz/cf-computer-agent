export type DashboardTaskState = "pending" | "running" | "completed" | "failed_retryable" | "failed_terminal";

export interface DashboardTask {
  id: string;
  kind: string;
  state: DashboardTaskState;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  maxAttempts: number;
}

export interface TaskDashboardOptions {
  now: string;
  quota?: { dailyUsed: number; dailyLimit: number };
}

export interface TaskDashboard {
  backlog: { pending: number; running: number; failedRetryable: number; oldestAgeMs: number };
  failures: { retryable: number; terminal: number };
  retries: { attempted: number; exhausted: number };
  byKind: Record<string, { total: number; backlog: number; failures: number }>;
  quota: { dailyUsed: number; dailyLimit: number; percent: number; state: "normal" | "degraded" | "exhausted" } | null;
}

export function buildTaskDashboard(tasks: readonly DashboardTask[], options: TaskDashboardOptions): TaskDashboard {
  if (tasks.length > 1_000) throw new RangeError("Task dashboard input is too large");
  const now = parseTime(options.now);
  const backlog = { pending: 0, running: 0, failedRetryable: 0, oldestAgeMs: 0 };
  const failures = { retryable: 0, terminal: 0 };
  const retries = { attempted: 0, exhausted: 0 };
  const byKind: TaskDashboard["byKind"] = {};
  for (const task of tasks) {
    validateTask(task);
    const kind = byKind[task.kind] ?? { total: 0, backlog: 0, failures: 0 };
    kind.total += 1;
    const age = Math.max(0, now - parseTime(task.createdAt));
    if (task.state === "pending") { backlog.pending += 1; kind.backlog += 1; backlog.oldestAgeMs = Math.max(backlog.oldestAgeMs, age); }
    else if (task.state === "running") { backlog.running += 1; kind.backlog += 1; backlog.oldestAgeMs = Math.max(backlog.oldestAgeMs, age); }
    else if (task.state === "failed_retryable") { backlog.failedRetryable += 1; kind.backlog += 1; failures.retryable += 1; kind.failures += 1; backlog.oldestAgeMs = Math.max(backlog.oldestAgeMs, age); }
    else if (task.state === "failed_terminal") { failures.terminal += 1; kind.failures += 1; }
    retries.attempted += task.attempts;
    if (task.attempts >= task.maxAttempts) retries.exhausted += 1;
    byKind[task.kind] = kind;
  }
  const quota = options.quota === undefined ? null : buildQuota(options.quota.dailyUsed, options.quota.dailyLimit);
  return { backlog, failures, retries, byKind, quota };
}

function validateTask(task: DashboardTask): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(task.id) || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u.test(task.kind)
    || !Object.hasOwn({ pending: true, running: true, completed: true, failed_retryable: true, failed_terminal: true }, task.state)
    || !Number.isSafeInteger(task.attempts) || task.attempts < 0
    || !Number.isSafeInteger(task.maxAttempts) || task.maxAttempts < 1 || task.attempts > task.maxAttempts) throw new TypeError("Task metadata is invalid");
  parseTime(task.createdAt);
  parseTime(task.updatedAt);
}

function buildQuota(dailyUsed: number, dailyLimit: number): NonNullable<TaskDashboard["quota"]> {
  if (!Number.isSafeInteger(dailyUsed) || dailyUsed < 0 || !Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyUsed > dailyLimit * 2) throw new TypeError("Quota metadata is invalid");
  const percent = Math.round((dailyUsed / dailyLimit) * 100);
  return { dailyUsed, dailyLimit, percent, state: percent >= 100 ? "exhausted" : percent >= 80 ? "degraded" : "normal" };
}

function parseTime(value: string): number {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new TypeError("Task timestamp is invalid");
  return time;
}
