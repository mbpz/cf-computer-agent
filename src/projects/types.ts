import type { Page, PageRequest } from "../pagination";

export type ProjectStatus = "planned" | "active" | "paused" | "completed" | "archived";
export const PROJECT_STATUSES: readonly ProjectStatus[] = ["planned", "active", "paused", "completed", "archived"];

export interface Project {
  id: string;
  memberId: string;
  clientKey: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  progress: number;
  targetAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreate {
  id: string;
  memberId: string;
  clientKey: string;
  title: string;
  description: string | null;
  progress: number;
  targetAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectUpdate {
  title: string;
  description: string | null;
  progress: number;
  targetAt: number | null;
  updatedAt: number;
}

export interface ProjectListFilters { status?: ProjectStatus; }
export interface ProjectListRequest extends PageRequest { filters: ProjectListFilters; }
export type ProjectPage = Page<Project>;

export interface ProjectGoalSummary { id: string; title: string; }
export interface ProjectSummary { goalCount: number; taskCount: number; completedTaskCount: number; goals: ProjectGoalSummary[]; }
