/** UTC calendar day and Monday-start ISO week boundaries shared by API and receipt validation. */
export function reviewRange(period: "daily" | "weekly", now: Date): { periodKey: string; from: string; to: string } {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const monday = day - ((now.getUTCDay() + 6) % 7) * 86400000;
  const from = period === "daily" ? day : monday;
  const thursday = new Date(monday + 3 * 86400000);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const firstMonday = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000;
  const week = Math.floor((monday - firstMonday) / (7 * 86400000)) + 1;
  return { periodKey: period === "daily" ? now.toISOString().slice(0, 10) : `${year}-W${String(week).padStart(2, "0")}`, from: new Date(from).toISOString(), to: new Date(from + (period === "daily" ? 1 : 7) * 86400000).toISOString() };
}
