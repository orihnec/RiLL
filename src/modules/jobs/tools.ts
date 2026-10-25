import { z } from "zod";
import type { Tool } from "../../kernel/agent/types";
import { createJob, filterJobs, listJobs, updateJob } from "./service";
import { jobStatusLabel, resolveJobStatusId, useJobStatusStore } from "./statusStore";

/** 当前状态名称列表（用于识别失败时反馈给模型）。 */
function statusHint(): string {
  return useJobStatusStore
    .getState()
    .statuses.map((s) => `${s.name}(${s.id})`)
    .join("、");
}

/** 状态参数：接受状态名称或 id（含用户自定义状态）。 */
const statusField = z
  .string()
  .describe("投递状态（状态名称或 id，例如 已投递/面试中/Offer/已拒绝/已归档；以用户当前自定义的状态为准）");

/** 把模型给的状态字符串解析为状态 id；空返回 {}；无法识别返回 error。 */
function resolveStatusInput(input: unknown): { id?: string; error?: string } {
  if (input === undefined || input === null || String(input).trim() === "") return {};
  const id = resolveJobStatusId(String(input));
  if (!id) {
    return { error: `无法识别状态「${String(input)}」。当前可用状态：${statusHint()}` };
  }
  return { id };
}

function defaultStatusId(): string {
  return useJobStatusStore.getState().statuses[0]?.id ?? "applied";
}

function fmtJobs(jobs: Awaited<ReturnType<typeof listJobs>>, title: string): string {
  if (jobs.length === 0) return `${title}：（暂无记录）`;
  return (
    `${title}（${jobs.length} 条）：\n` +
    jobs
      .map(
        (j, i) =>
          `${i + 1}. 【${jobStatusLabel(j.status)}】${j.company} — ${j.position}` +
          `（投递于 ${new Date(j.applied_at).toLocaleDateString("zh-CN")}）` +
          (j.url ? `\n   链接：${j.url}` : "") +
          (j.notes ? `\n   备注：${j.notes.slice(0, 120)}` : "") +
          `\n   id: ${j.id}`,
      )
      .join("\n")
  );
}

const jobs_list: Tool = {
  name: "jobs_list",
  description:
    "列出求职投递记录（可按状态过滤、按关键词搜索）。用户询问投递情况/求职进展、或问'XX 公司那个怎么样了''我投过哪些实习'时使用。" +
    "keyword 会在**公司/职位/备注/链接/状态名**里搜索，空格分词且全部命中（例如 '字节 实习'）。返回的 id 用于 jobs_update。",
  parameters: z.object({
    status: statusField.optional().describe("按状态过滤，不填返回全部"),
    keyword: z
      .string()
      .optional()
      .describe("关键词搜索（公司/职位/备注/链接/状态），如 '字节'、'算法 实习'"),
  }),
  execute: async (args) => {
    const r = resolveStatusInput(args.status);
    if (r.error) return r.error;
    const keyword = args.keyword === undefined || args.keyword === null ? "" : String(args.keyword);
    const all = await listJobs(r.id);
    const jobs = filterJobs(all, keyword, (id) => jobStatusLabel(id));
    const title = [
      r.id ? `${jobStatusLabel(r.id)}的投递` : "投递记录",
      keyword.trim() ? `匹配「${keyword.trim()}」（共 ${all.length} 条里命中 ${jobs.length} 条）` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return fmtJobs(jobs, title);
  },
};

const jobs_create: Tool = {
  name: "jobs_create",
  description:
    "新增一条求职投递记录（公司 + 职位，可选状态/链接/备注/投递时间）。用户说'投了 XX 公司'或'记录一下投递'、或上传了投递统计表格要求录入时使用。创建类操作可直接执行，无需确认。若用户未提供链接，可先用 web_search 搜索该公司校招官网（校园招聘站点，通常域名含 campus/jobs/careers/recruit）或职位页面，把 url 一并填入（找不到就留空，不要编造链接）。",
  parameters: z.object({
    company: z.string().describe("公司名称"),
    position: z.string().describe("职位名称"),
    status: statusField.optional().describe("当前状态；不填默认「准备投递」。已经投出去了才需要显式传「已投递」"),
    url: z.string().optional().describe("投递链接或校招官网（可先用 web_search 搜索补全，优先校招站点）"),
    notes: z.string().optional().describe("备注（如薪资、地点、面试时间）"),
    appliedAt: z.number().optional().describe("投递时间（unix 毫秒），默认现在"),
  }),
  execute: async (args) => {
    const r = resolveStatusInput(args.status);
    if (r.error) return r.error;
    const job = await createJob({
      company: String(args.company ?? ""),
      position: String(args.position ?? ""),
      status: r.id ?? defaultStatusId(),
      url: args.url !== undefined ? String(args.url) : undefined,
      notes: args.notes !== undefined ? String(args.notes) : undefined,
      appliedAt: typeof args.appliedAt === "number" ? args.appliedAt : undefined,
    });
    return `已创建投递记录：${job.company} — ${job.position}（${jobStatusLabel(job.status)}），id: ${job.id}`;
  },
};

const jobs_update: Tool = {
  name: "jobs_update",
  description:
    "更新投递记录（调整状态/公司/职位/链接/备注）。用户说'XX 进面试了/拿到 offer 了/被拒了'时使用，把状态流转到对应状态（如 面试中/Offer/已拒绝；以用户自定义状态为准，状态名可用 jobs_list 结果里的名称）。修改类操作：必须先向用户复述将要执行的变更，等待用户明确确认后再调用本工具。若记录缺链接且用户要求补全，可先用 web_search 搜索校招官网（campus/jobs 等招聘站点）后一并更新。",
  parameters: z.object({
    id: z.string().describe("投递记录 id（来自 jobs_list 返回）"),
    company: z.string().optional(),
    position: z.string().optional(),
    status: statusField.optional(),
    url: z.string().optional().describe("投递链接或校招官网（可先用 web_search 搜索补全，优先校招站点）"),
    notes: z.string().optional(),
  }),
  execute: async (args) => {
    const r = resolveStatusInput(args.status);
    if (r.error) return r.error;
    await updateJob(String(args.id), {
      company: args.company !== undefined ? String(args.company) : undefined,
      position: args.position !== undefined ? String(args.position) : undefined,
      status: r.id,
      url: args.url !== undefined ? String(args.url) : undefined,
      notes: args.notes !== undefined ? String(args.notes) : undefined,
    });
    return `已更新投递记录 ${String(args.id)}`;
  },
};

/**
 * 加入「准备投递」：用户说"这个岗位我想投 / 先存起来 / 加进待投"时用。
 *
 * 单独一个工具（而不是让模型自己传 status）是因为模型经常忘记 status 或传错名字；
 * 固定写 `preparing` 最稳，也最贴合用户口语。
 */
const jobs_prepare: Tool = {
  name: "jobs_prepare",
  description:
    "把岗位加入「准备投递」（想投但还没投）。用户说'这个我想投''先存起来''加进待投'、或让你从简历/校招库里挑几个岗位收起来时使用。创建类操作可直接执行，无需确认。若已知网申链接一并填入。",
  parameters: z.object({
    company: z.string().describe("公司名称"),
    position: z.string().describe("职位名称"),
    url: z.string().optional().describe("网申链接（可选）"),
    notes: z.string().optional().describe("备注（地点 / 截止 / 来源）"),
  }),
  execute: async (args) => {
    const job = await createJob({
      company: String(args.company ?? ""),
      position: String(args.position ?? ""),
      status: "preparing",
      url: args.url !== undefined ? String(args.url) : undefined,
      notes: args.notes !== undefined ? String(args.notes) : undefined,
    });
    return `已加入准备投递：${job.company} — ${job.position}（id: ${job.id}）`;
  },
};

/**
 * 投递进展概览：各状态数量 + 本周新增 + 最近 5 条。
 * 用户问「投了多少 / 进展怎么样」时比 jobs_list 更省上下文。
 */
const jobs_stats: Tool = {
  name: "jobs_stats",
  description:
    "求职进展概览：各状态数量、近 7 天新增投递数、最近 5 条记录。用户问'我投了多少''进展怎么样''还有哪些在等消息'时使用（比 jobs_list 省上下文）。",
  parameters: z.object({}),
  execute: async () => {
    const all = await listJobs();
    if (all.length === 0) return "还没有投递记录。";
    const byStatus = new Map<string, number>();
    for (const j of all) byStatus.set(j.status, (byStatus.get(j.status) ?? 0) + 1);
    const counts = [...byStatus.entries()].map(([id, n]) => `${jobStatusLabel(id)} ${n}`).join(" · ");
    const weekAgo = Date.now() - 7 * 24 * 3600_000;
    const week = all.filter((j) => j.applied_at >= weekAgo).length;
    const recent = [...all]
      .sort((a, b) => b.applied_at - a.applied_at)
      .slice(0, 5)
      .map((j) => `${jobStatusLabel(j.status)}｜${j.company} — ${j.position}`)
      .join("\n");
    return `共 ${all.length} 条投递（近 7 天新增 ${week} 条）\n按状态：${counts}\n最近 5 条：\n${recent}`;
  },
};

export const jobsTools: Record<string, Tool> = {
  jobs_list,
  jobs_stats,
  jobs_create,
  jobs_prepare,
  jobs_update,
};
