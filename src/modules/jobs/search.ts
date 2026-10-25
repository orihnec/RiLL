import type { JobApplication } from "./service";

/* ---------------- 搜索（纯函数，前端过滤与 Agent 工具共用同一套规则） ---------------- */

/** 把一条投递拼成可搜索文本：公司 / 职位 / 备注 / 链接 / 状态名 */
export function jobHaystack(job: JobApplication, statusName = ""): string {
  return [job.company, job.position, job.notes ?? "", job.url ?? "", statusName].join("\n").toLowerCase();
}

/**
 * 关键词匹配：**空格分词、全部命中**（AND）。
 * 例：`字节 实习` 只命中同时含这两个词的记录；`字节` 命中公司或备注里提到字节的。
 */
export function matchJob(job: JobApplication, query: string, statusName = ""): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = jobHaystack(job, statusName);
  return terms.every((t) => hay.includes(t));
}

/** 按关键词过滤（statusNameOf 用来把状态 id 映射成可搜的状态名）。 */
export function filterJobs(
  jobs: JobApplication[],
  query: string,
  statusNameOf?: (statusId: string) => string,
): JobApplication[] {
  if (!query.trim()) return jobs;
  return jobs.filter((j) => matchJob(j, query, statusNameOf?.(j.status) ?? ""));
}

/** 搜索关键词（小写、已去空），用于高亮命中片段。 */
export function searchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}
