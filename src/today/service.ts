import type { CalendarService } from "../calendar/service";
import type { CalendarEvent } from "../calendar/types";
import type { InboxService } from "../inbox/service";
import type { InboxItem } from "../inbox/types";
import type { ProjectsService } from "../projects/service";
import type { Project } from "../projects/types";
import type { TasksService } from "../tasks/service";
import type { WorkScope } from "../maintenance/lifecycle";
import { parallelWork } from "../maintenance/work";

export interface TodaySnapshot {
  date: string;
  tasks: Awaited<ReturnType<TasksService["list"]>>;
  taskSummary: Awaited<ReturnType<TasksService["summary"]>>;
  inbox: InboxItem[];
  projects: Project[];
  calendar: CalendarEvent[];
}

export class TodayService {
  constructor(private readonly services: { tasks: TasksService; inbox: InboxService; projects: ProjectsService; calendar: CalendarService }, private readonly now: () => Date = () => new Date(), private readonly workScope?: WorkScope) {}

  async get(memberId: string): Promise<TodaySnapshot> {
    const now = this.now();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const [tasks, taskSummary, inbox, projects, calendar] = await parallelWork(this.workScope, [
      () => this.services.tasks.list(memberId, { due: "today" }, { page: 1, pageSize: 20 }),
      () => this.services.tasks.summary(memberId),
      () => this.services.inbox.list(memberId, { status: "inbox" }, { limit: 10 }),
      () => this.services.projects.list(memberId, { status: "active" }, { limit: 10 }),
      () => this.services.calendar.list(memberId, start.getTime(), end.getTime(), { limit: 20 }),
    ]);
    return {
      date: start.toISOString().slice(0, 10),
      tasks,
      taskSummary,
      inbox: inbox.items,
      projects: projects.items,
      calendar: calendar.items,
    };
  }
}
