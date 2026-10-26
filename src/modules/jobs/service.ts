import { getDb } from "../../kernel/db";
import { notifyJobsChanged } from "./changes";

export type JobStatus = string;
export interface JobApplication {
  id: string;
  company: string;
  position: string;
  status: JobStatus;
  url: string | null;
  notes: string | null;
  applied_at: number | null;
  updated_at: number;
  created_at: number;
  revision: number;
  extras: Record<string, unknown> | null;
}
export interface NewJobInput {
  company: string; position: string; status?: JobStatus; url?: string; notes?: string; appliedAt?: number | null;
}
export type JobPatch = Partial<{
  company: string; position: string; status: JobStatus; url: string; notes: string; appliedAt: number | null;
}>;
type Row = Omit<JobApplication, "applied_at" | "extras"> & { applied_at: number; applied_at_known: number; extras_json: string | null };
const COLS = "id, company, position, status, url, notes, applied_at, applied_at_known, updated_at, created_at, revision, extras_json";

function toJob(row: Row): JobApplication {
  const { applied_at_known, extras_json, ...job } = row;
  return { ...job, applied_at: applied_at_known ? row.applied_at : null,
    extras: extras_json ? JSON.parse(extras_json) as Record<string, unknown> : null };
}

export async function listJobs(status?: JobStatus): Promise<JobApplication[]> {
  const rows = await getDb().select<Row[]>(`SELECT ${COLS} FROM job_applications${status ? " WHERE status = $1" : ""} ORDER BY updated_at DESC`, status ? [status] : []);
  return rows.map(toJob);
}

export async function createJob(input: NewJobInput): Promise<JobApplication> {
  const id = crypto.randomUUID(), now = Date.now();
  const status = input.status ?? "applied";
  const appliedAt = input.appliedAt === undefined ? (status === "preparing" ? null : now) : input.appliedAt;
  if (appliedAt !== null && !Number.isFinite(appliedAt)) throw new Error("投递日期无效");
  const job: JobApplication = { id, company: input.company.trim(), position: input.position.trim(), status,
    url: input.url?.trim() || null, notes: input.notes?.trim() || null, applied_at: appliedAt,
    updated_at: now, created_at: now, revision: 0, extras: null };
  await getDb().execute(`INSERT INTO job_applications
    (id, company, position, status, url, notes, applied_at, applied_at_known, updated_at, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
    [id, job.company, job.position, status, job.url, job.notes, appliedAt ?? 0, appliedAt === null ? 0 : 1, now]);
  notifyJobsChanged();
  return job;
}

export async function updateJob(id: string, patch: JobPatch): Promise<void> {
  const fields: string[] = [], values: unknown[] = [];
  const add = (column: string, value: unknown) => { values.push(value); fields.push(`${column} = $${values.length}`); };
  for (const key of ["company", "position", "status", "url", "notes"] as const) {
    if (patch[key] === undefined) continue;
    const value = patch[key]!.trim();
    add(key, key === "url" || key === "notes" ? value || null : value);
  }
  if (patch.appliedAt !== undefined) {
    if (patch.appliedAt !== null && !Number.isFinite(patch.appliedAt)) throw new Error("投递日期无效");
    add("applied_at", patch.appliedAt ?? 0);
    add("applied_at_known", patch.appliedAt === null ? 0 : 1);
  } else if (patch.status === "preparing") {
    add("applied_at", 0); add("applied_at_known", 0);
  } else if (patch.status !== undefined) {
    values.push(Date.now());
    fields.push(`applied_at = CASE WHEN status = 'preparing' THEN $${values.length} ELSE applied_at END`,
      "applied_at_known = CASE WHEN status = 'preparing' THEN 1 ELSE applied_at_known END");
  }
  if (!fields.length) return;
  add("updated_at", Date.now());
  values.push(id);
  await getDb().execute(`UPDATE job_applications SET ${fields.join(", ")}, revision = revision + 1 WHERE id = $${values.length}`, values);
  notifyJobsChanged();
}

export async function deleteJob(id: string): Promise<void> {
  // 来源绑定保留，使下次导入能识别本地已经删除的记录。
  await getDb().execute("DELETE FROM job_applications WHERE id = $1", [id]);
  notifyJobsChanged();
}

export async function reassignJobStatus(from: string, to: string): Promise<void> {
  await getDb().execute(`UPDATE job_applications SET status = $1, updated_at = $2, revision = revision + 1,
    applied_at = CASE WHEN $1 = 'preparing' THEN 0 WHEN status = 'preparing' THEN $2 ELSE applied_at END,
    applied_at_known = CASE WHEN $1 = 'preparing' THEN 0 WHEN status = 'preparing' THEN 1 ELSE applied_at_known END
    WHERE status = $3`, [to, Date.now(), from]);
  notifyJobsChanged();
}
export * from "./search";
