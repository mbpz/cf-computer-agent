import { AppError } from "../http";

/**
 * Bounds for `submissions.created_at`, stated as a UTC calendar day
 * (`YYYY-MM-DD`) or as a canonical ISO instant.
 *
 * The normalized interval is half-open: `from <= created_at < to`. A stated day
 * covers that whole UTC day, so a date `from` becomes the day's start and a date
 * `to` becomes the start of the following day (the stated end day is included).
 * A stated instant is used verbatim, which makes an instant `to` exclusive.
 */
export interface SubmissionCreatedRange {
  from?: string;
  to?: string;
}

const calendarDay = /^\d{4}-\d{2}-\d{2}$/u;
const dayMilliseconds = 86_400_000;

export function normalizeSubmissionCreatedRange(request: { from?: unknown; to?: unknown }): SubmissionCreatedRange {
  const from = boundInstant(request.from, "from");
  const to = boundInstant(request.to, "to");
  if (from !== undefined && to !== undefined && from >= to) throw invalidRange();
  return { ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) };
}

function boundInstant(value: unknown, bound: "from" | "to"): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw invalidRange();
  if (calendarDay.test(value)) {
    const day = new Date(`${value}T00:00:00.000Z`);
    // A calendar day round-trips only when the month and day exist, e.g. not 2026-02-30.
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value) throw invalidRange();
    if (bound === "from") return day.toISOString();
    const exclusive = new Date(day.getTime() + dayMilliseconds);
    // `9999-12-31` ends at year 10000, which no stored timestamp can reach: the bound is open.
    return Number.isFinite(exclusive.getTime()) && exclusive.getUTCFullYear() <= 9999 ? exclusive.toISOString() : undefined;
  }
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) throw invalidRange();
  return value;
}

function invalidRange(): AppError {
  return new AppError("PAGE_INVALID", "Submission date range is invalid", 400);
}
