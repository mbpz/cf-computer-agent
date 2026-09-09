import type { Page, PageRequest } from "../pagination";

export type GoalStatus = "active" | "paused" | "completed" | "archived";
export const GOAL_STATUSES: readonly GoalStatus[] = ["active", "paused", "completed", "archived"];

export interface Goal {
  id: string;
  memberId: string;
  clientKey: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  progress: number;
  targetAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalCreate {
  id: string;
  memberId: string;
  clientKey: string;
  title: string;
  description: string | null;
  targetAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface GoalUpdate {
  title: string;
  description: string | null;
  targetAt: number | null;
  updatedAt: number;
}

export interface GoalListFilters { status?: GoalStatus; }
export interface GoalListRequest extends PageRequest { filters: GoalListFilters; }
export type GoalPage = Page<Goal>;
