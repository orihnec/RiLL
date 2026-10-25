import { getDb } from "../../kernel/db";

/** 求职状态：可自定义，存 app_settings（见 statusStore），job 上只存状态 id 字符串。 */
export type JobStatus = string;

export interface JobApplication {
  id: string;
  company: string;
  position: string;
  status: JobStatus;
  url: string | null;
  notes: string | null;
  applied_at: number;
  updated_at: number;
  created_at: number;
}

export interface NewJobInput {
  company: string;
  position: string;
  status?: JobStatus;
  url?: string;
  notes?: string;
  appliedAt?: number;
}

export type JobPatch = Partial<{
  company: string;
  position: string;
  status: JobStatus;
  url: string;
  notes: string;
}>;

/* ---------------- 搜索已移到 search.ts（barrel 见文件末尾） ---------------- */

type Row = {
  id: string;
  company: string;
  position: string;
  status: string;
  url: string | null;  notes: string | null;
  applied_at: number;
  updated_at: number;
  created_at: number;
};

const COLS = "id, company, position, status, url, notes, applied_at, updated_at, created_at";

function toJob(r: Row): JobApplication {
  return {
    id: r.id,
    company: r.company,
    position: r.position,
    // 保留原始状态 id（自定义状态也原样保留；渲染端解析名称/配色）
    status: r.status || "applied",
    url: r.url,
    notes: r.notes,
    applied_at: r.applied_at,
    updated_at: r.updated_at,
    created_at: r.created_at,
  };
}

/** 列出投递记录（可按状态过滤，默认全部，最新更新在前）。 */
export async function listJobs(status?: JobStatus): Promise<JobApplication[]> {
  const db = getDb();
  if (status) {
    const rows = await db.select<Row[]>(
      `SELECT ${COLS} FROM job_applications WHERE status = $1 ORDER BY updated_at DESC`,
      [status],
    );
    return rows.map(toJob);
  }
  const rows = await db.select<Row[]>(
    `SELECT ${COLS} FROM job_applications ORDER BY updated_at DESC`,
  );
  return rows.map(toJob);
}

export async function createJob(input: NewJobInput): Promise<JobApplication> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.execute(
    `INSERT INTO job_applications (id, company, position, status, url, notes, applied_at, updated_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [
      id,
      input.company.trim(),
      input.position.trim(),
      input.status ?? "applied",
      input.url?.trim() || null,
      input.notes?.trim() || null,
      input.appliedAt ?? now,
      now,
    ],
  );
  return {
    id,
    company: input.company.trim(),
    position: input.position.trim(),
    status: input.status ?? "applied",
    url: input.url?.trim() || null,
    notes: input.notes?.trim() || null,
    applied_at: input.appliedAt ?? now,
    updated_at: now,
    created_at: now,
  };
}

export async function updateJob(id: string, patch: JobPatch): Promise<void> {
  const db = getDb();
  const now = Date.now();
  // 逐字段更新（patch 字段都是可控白名单）
  if (patch.company !== undefined) {
    await db.execute("UPDATE job_applications SET company = $1, updated_at = $2 WHERE id = $3", [
      patch.company.trim(),
      now,
      id,
    ]);
  }
  if (patch.position !== undefined) {
    await db.execute("UPDATE job_applications SET position = $1, updated_at = $2 WHERE id = $3", [
      patch.position.trim(),
      now,
      id,
    ]);
  }
  if (patch.status !== undefined) {
    await db.execute("UPDATE job_applications SET status = $1, updated_at = $2 WHERE id = $3", [
      patch.status,
      now,
      id,
    ]);
  }
  if (patch.url !== undefined) {
    await db.execute("UPDATE job_applications SET url = $1, updated_at = $2 WHERE id = $3", [
      patch.url.trim() || null,
      now,
      id,
    ]);
  }
  if (patch.notes !== undefined) {
    await db.execute("UPDATE job_applications SET notes = $1, updated_at = $2 WHERE id = $3", [
      patch.notes.trim() || null,
      now,
      id,
    ]);
  }
}

export async function deleteJob(id: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM job_applications WHERE id = $1", [id]);
}

/** 删除状态时重分配：把该状态的投递改成 to。 */
export async function reassignJobStatus(from: string, to: string): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE job_applications SET status = $1, updated_at = $2 WHERE status = $3", [
    to,
    Date.now(),
    from,
  ]);
}

/** 搜索纯函数：jobHaystack / matchJob / filterJobs / searchTerms。 */
export * from "./search";
