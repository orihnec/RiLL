export function compareAppliedDates(a: number | null, b: number | null, direction: "asc" | "desc"): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return (a - b) * (direction === "asc" ? 1 : -1);
}

export function isRecentApplication(job: { status: string; applied_at: number | null }, since: number, until = Date.now()): boolean {
  return job.status !== "preparing" && job.applied_at !== null && job.applied_at >= since && job.applied_at <= until;
}
