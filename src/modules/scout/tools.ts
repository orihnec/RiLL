import { z } from "zod";
import type { Tool } from "../../kernel/agent/types";
import { useScoutStore } from "../../stores/scoutStore";
import { crawlCampusRecruits, CAMPUS_PAGE_URL } from "./crawl";
import {
  deleteAllCampusRecruits,
  deleteCampusRecruit,
  countCampusRecruits,
  listCampusRecruits,
  listCampusCompanies,
  campusStats,
  campusFacets,
  CAMPUS_FACET_COLUMNS,
  CAMPUS_SORT_OPTIONS,
  isCampusSortKey,
  splitValues,
  type CampusRecruit,
  type CampusSort,
} from "./service";

/**
 * scout 模块 Agent 工具：全部只读本地校招信息库（scout_refresh 除外，它去抓取）。
 * 「有哪些可以投递的公司/岗位」一律走这里查本地库，不要用 web_search 现搜。
 */

/** 单行紧凑格式：一条记录一行（15 条约 2 千字符，不会被上下文截断）。 */
function formatRecruit(r: CampusRecruit, index: number): string {
  const meta: string[] = [];
  if (r.batch) meta.push(r.batch);
  if (r.nature) meta.push(r.nature);
  const head = `${index + 1}.${r.isKey ? "★" : ""}${r.company}${meta.length ? `(${meta.join("·")})` : ""}`;
  const parts = [head];
  if (r.positions) parts.push(`岗位:${r.positions.slice(0, 60)}`);
  if (r.location) parts.push(`地点:${splitValues(r.location).slice(0, 3).join("/")}`);
  const dl = r.deadlineIso ?? r.deadline;
  if (dl) parts.push(`截止:${dl}`);
  if (r.appLink ?? r.sourceLink) parts.push(`网申:${r.appLink ?? r.sourceLink}`);
  parts.push(`id:${r.id}`);
  return parts.join(" ｜ ");
}

/** 多选筛选参数（各工具共用）。 */
function filterParams() {
  return {
    keyword: z.string().optional().describe("关键词：公司名/岗位/地点/行业/性质/来源"),
    company: z.string().optional().describe("公司名（含模糊匹配）"),
    batch: z.array(z.string()).optional().describe("批次（如 ['27届']），多选"),
    industry: z.array(z.string()).optional().describe("行业，多选"),
    nature: z.array(z.string()).optional().describe("公司性质（国企/民营/外企…），多选"),
    month: z.array(z.string()).optional().describe("收录月份，多选"),
    location: z.array(z.string()).optional().describe("工作地点，多选"),
    linkSource: z.array(z.string()).optional().describe("信息来源（公众号/学校就业网等），多选"),
    onlyKey: z.boolean().optional().describe("只看重点推荐（★）"),
    openOnly: z.boolean().optional().describe("只看还能投递的（截止日期未过；不确定的会保留）"),
  };
}

function readFilters(args: Record<string, unknown>) {
  const asArray = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map(String) : undefined);
  return {
    keyword: args.keyword !== undefined ? String(args.keyword) : undefined,
    company: args.company !== undefined ? String(args.company) : undefined,
    batch: asArray(args.batch),
    industry: asArray(args.industry),
    nature: asArray(args.nature),
    month: asArray(args.month),
    location: asArray(args.location),
    linkSource: asArray(args.linkSource),
    onlyKey: args.onlyKey === true,
    openOnly: args.openOnly === true,
  };
}

const scout_refresh: Tool = {
  name: "scout_refresh",
  description:
    "抓取校招汇总数据（campus.sma-wiki.cn 校招信息汇总页的公开数据分片）并去重入库到本地「校招信息库」。同一批数据重复抓取不会产生重复记录，只会刷新字段。用户说「更新/抓取一下校招信息」「刷新招聘库」时使用。抓取需要几秒到几十秒。",
  parameters: z.object({}),
  execute: async () => {
    const r = await crawlCampusRecruits();
    useScoutStore.getState().bump();
    const warn =
      r.fetched !== r.declaredTotal
        ? `（页面标注 ${r.declaredTotal} 条，实际读取 ${r.fetched} 条，以实际数据为准）`
        : "";
    return (
      `校招信息抓取完成${warn}：共 ${r.shards} 个数据批次、${r.fetched} 条源记录 → ` +
      `新增 ${r.created} 条、刷新 ${r.updated} 条` +
      (r.dupInBatch > 0 ? `、源内重复合并 ${r.dupInBatch} 条` : "") +
      (r.skipped > 0 ? `、字段缺失跳过 ${r.skipped} 条` : "") +
      `。\n数据源：${CAMPUS_PAGE_URL}`
    );
  },
};

const scout_list: Tool = {
  name: "scout_list",
  description:
    "检索本地校招信息库里已入库的**具体岗位记录**（含岗位、地点、截止日期、网申链接、id）。支持关键词 + 多列筛选（每列可多选、条件之间是「且」）+ 排序（截止时间 / 更新·发布时间 / 收录时间 / 公司名，可正序倒序）。用户问「XX 公司有哪些岗位」「上海的校招有哪些」「哪些快截止了」「最近更新了哪些」时使用；想知道有哪些公司先看 scout_companies。",
  parameters: z.object({
    ...filterParams(),
    sortBy: z
      .enum(["default", "update", "deadline", "firstSeen", "company"])
      .optional()
      .describe(
        "排序：default=重点优先（默认）/ update=更新·发布时间 / deadline=截止时间 / firstSeen=收录时间 / company=公司名",
      ),
    sortDir: z
      .enum(["asc", "desc"])
      .optional()
      .describe("排序方向：asc=正序（时间由早到晚 / 名称 A→Z），desc=倒序（默认）"),
    limit: z.number().int().min(1).max(50).optional().describe("返回条数，默认 15"),
  }),
  execute: async (args) => {
    const limit = typeof args.limit === "number" ? args.limit : 15;
    const sortKey = isCampusSortKey(args.sortBy) ? args.sortBy : "default";
    const sortDir = args.sortDir === "asc" ? "asc" : "desc";
    const sort: CampusSort = { key: sortKey, dir: sortDir };
    const result = await listCampusRecruits({ ...readFilters(args), sort, limit });
    if (result.rows.length === 0) {
      const total = await countCampusRecruits();
      return total === 0
        ? "本地校招信息库还是空的：请先调用 scout_refresh 抓取入库（或让用户点「抓取并入库」按钮），不要用 web_search 现搜"
        : "本地库里没有符合条件的记录，可以放宽筛选条件（去掉批次/地点/仅重点等）再试";
    }
    const sortLabel =
      sortKey === "default"
        ? "重点/更新在前"
        : `${CAMPUS_SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? sortKey}${sortDir === "asc" ? "正序" : "倒序"}`;
    return (
      `本地校招信息库命中 ${result.total} 条，返回 ${result.rows.length} 条（★=重点，排序：${sortLabel}）：\n` +
      result.rows.map((r, i) => formatRecruit(r, i)).join("\n")
    );
  },
};

const scout_companies: Tool = {
  name: "scout_companies",
  description:
    "汇总本地校招信息库里**有哪些公司可以投递**（去重后的公司清单 + 每家的条目数/批次/地点/行业）。用户问「我可以投递哪些公司」「有哪些大厂在招」「有什么可以投的」时优先用这个工具，可加地点/行业/批次/仅未截止等筛选。要具体岗位和网申链接再用 scout_list。",
  parameters: z.object({
    ...filterParams(),
    limit: z.number().int().min(1).max(100).optional().describe("返回公司数，默认 40"),
  }),
  execute: async (args) => {
    const limit = typeof args.limit === "number" ? args.limit : 40;
    const result = await listCampusCompanies({ ...readFilters(args), limit });
    if (result.rows.length === 0) {
      const total = await countCampusRecruits();
      return total === 0
        ? "本地校招信息库还是空的：请先调用 scout_refresh 抓取入库（或让用户点「抓取并入库」按钮），不要用 web_search 现搜"
        : "本地库里没有符合这些条件的公司，可以放宽筛选条件再试";
    }
    const lines = result.rows.map((c, i) => {
      const bits: string[] = [`${c.count} 条`];
      if (c.keyCount > 0) bits.push(`★${c.keyCount}`);
      if (c.batches.length) bits.push(`批次 ${c.batches.join("、")}`);
      if (c.locations.length) bits.push(`地点 ${c.locations.slice(0, 6).join("、")}`);
      if (c.industries.length) bits.push(`行业 ${c.industries.slice(0, 3).join("、")}`);
      if (c.latestUpdate) bits.push(`最近更新 ${c.latestUpdate}`);
      return `${i + 1}. ${c.company}（${bits.join("｜")}）`;
    });
    return (
      `本地校招信息库共 ${result.total} 家公司，返回 ${result.rows.length} 家（★=有重点条目，按重点数/更新日期排序）：\n` +
      lines.join("\n") +
      `\n\n要对某家公司看具体岗位和网申链接，用 scout_list 传 company 参数。`
    );
  },
};

const scout_stats: Tool = {
  name: "scout_stats",
  description:
    "本地校招信息库的概览统计：收录总数、今日/近 7 天新增、重点数、公司数，以及批次/行业/工作地点/信息来源的分布（各取前几名）。用户问「库里整体情况」「哪些方向/城市机会多」时使用。",
  parameters: z.object({
    top: z.number().int().min(1).max(20).optional().describe("每个维度返回前几名，默认 8"),
  }),
  execute: async (args) => {
    const total = await countCampusRecruits();
    if (total === 0) {
      return "本地校招信息库还是空的：请先调用 scout_refresh 抓取入库（或让用户点「抓取并入库」按钮）";
    }
    const top = typeof args.top === "number" ? args.top : 8;
    const [stats, facets, companies] = await Promise.all([
      campusStats(),
      campusFacets(),
      listCampusCompanies({ limit: 1 }),
    ]);
    const dist = CAMPUS_FACET_COLUMNS.map((f) => {
      const vals = facets[f.key].slice(0, top).map((v) => `${v.value}(${v.count})`);
      return vals.length ? `${f.label}：${vals.join("、")}` : null;
    }).filter(Boolean);
    return (
      `本地校招信息库概览：收录 ${stats.total} 条 / 公司 ${companies.total} 家 / ★重点 ${stats.keyCount} 条 / ` +
      `今日新增 ${stats.today} 条 / 近 7 天 ${stats.week} 条\n` +
      dist.join("\n")
    );
  },
};

const scout_clear: Tool = {
  name: "scout_clear",
  description:
    "清空校招信息库中的全部记录（危险操作，不可恢复）。执行前必须先向用户复述「将清空全部 N 条校招记录」，等待用户明确确认后再调用本工具。",
  parameters: z.object({}),
  execute: async () => {
    const n = await countCampusRecruits();
    await deleteAllCampusRecruits();
    useScoutStore.getState().bump();
    return `已清空校招信息库（共删除 ${n} 条记录）`;
  },
};

const scout_delete: Tool = {
  name: "scout_delete",
  description:
    "删除校招信息库中的单条记录（id 来自 scout_list 返回的「id：…」）。删除类操作：执行前先向用户复述要删除哪条，等待明确确认后再调用。",
  parameters: z.object({
    id: z.string().describe("校招记录 id（scout_list 返回）"),
  }),
  execute: async (args) => {
    const id = String(args.id ?? "");
    if (!id) return "id 不能为空";
    await deleteCampusRecruit(id);
    useScoutStore.getState().bump();
    return `已删除校招记录 ${id}`;
  },
};

export const scoutTools: Record<string, Tool> = {
  scout_refresh,
  scout_list,
  scout_companies,
  scout_stats,
  scout_clear,
  scout_delete,
};
