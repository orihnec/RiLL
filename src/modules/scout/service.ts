import { getDb } from "../../kernel/db";
import { localToday, parseDeadline } from "../../lib/deadline";

/**
 * scout 模块数据层：校招信息库（campus.sma-wiki.cn 校招汇总抓取入库）。
 *
 * 与旧「联网搜索候选（job_listings）」无关：本表按源站字段一一落库，
 * 去重键 = 网申链接（组内唯一时）/ 公司+批次+岗位，重复抓取只刷新不新增。
 */

/* ---------------- 类型 ---------------- */

export interface CampusRecruit {
  id: string;
  company: string;
  batch: string | null;
  positions: string | null;
  location: string | null;
  industry: string | null;
  nature: string | null;
  month: string | null;
  updateDate: string | null;
  fullDate: string | null;
  /** 源站原文（可能是「招满为止」这类文本） */
  deadline: string | null;
  /** 归一化截止日期 YYYY-MM-DD（源站格式五花八门，排序/过期判断都用它；无法识别为 null） */
  deadlineIso: string | null;
  appLink: string | null;
  sourceLink: string | null;
  linkSource: string | null;
  evaluation: string | null;
  isKey: boolean;
  isCommercial: boolean;
  commercialExpiry: string | null;
  isFeaturedCard: boolean;
  firstSeenAt: number;
  updatedAt: number;
}

/** 抓取层产出的标准记录（去重键由 crawl.ts 计算）。 */
export interface CampusRecordInput {
  dedupeKey: string;
  company: string;
  batch: string | null;
  positions: string | null;
  location: string | null;
  industry: string | null;
  nature: string | null;
  month: string | null;
  updateDate: string | null;
  fullDate: string | null;
  /** 源站原文（可能是「招满为止」这类文本） */
  deadline: string | null;
  /** 归一化截止日期（见 lib/deadline.ts；无法识别为 null） */
  deadlineIso: string | null;
  appLink: string | null;
  sourceLink: string | null;
  linkSource: string | null;
  evaluation: string | null;
  isKey: boolean;
  isCommercial: boolean;
  commercialExpiry: string | null;
  isFeaturedCard: boolean;
  /** 源记录原文（存 raw_json，源站加字段时不用改表） */
  raw: unknown;
}

/** 排序键：default=重点优先（默认）/ update=更新·发布时间 / deadline=截止时间 / firstSeen=收录时间 / company=公司名 */
export type CampusSortKey = "default" | "update" | "deadline" | "firstSeen" | "company";
export type CampusSortDir = "asc" | "desc";

export interface CampusSort {
  key: CampusSortKey;
  dir: CampusSortDir;
}

export const DEFAULT_SORT: CampusSort = { key: "default", dir: "desc" };

/** 排序选项（UI 与工具共用一份定义）。 */
export const CAMPUS_SORT_OPTIONS: { key: CampusSortKey; label: string; hint: string }[] = [
  { key: "default", label: "默认", hint: "重点优先，其次更新日期" },
  { key: "update", label: "更新 / 发布时间", hint: "按源站更新日期（其次完整日期）" },
  { key: "deadline", label: "截止时间", hint: "按投递截止日期；空值/无法识别的排在最后" },
  { key: "firstSeen", label: "收录时间", hint: "按本地首次抓取入库的时间" },
  { key: "company", label: "公司名", hint: "按公司名排序" },
];

export function isCampusSortKey(v: unknown): v is CampusSortKey {
  return CAMPUS_SORT_OPTIONS.some((o) => o.key === v);
}

/** 多列筛选条件：数组列内 OR（可多选），列与列之间 AND（多重筛选）。 */
export interface CampusQuery {
  keyword?: string;
  /** 公司名（单独一列，便于「XX 公司有哪些岗位」） */
  company?: string;
  batch?: string[];
  industry?: string[];
  nature?: string[];
  month?: string[];
  location?: string[];
  linkSource?: string[];
  /** 只看重点推荐 */
  onlyKey?: boolean;
  /** 只看还能投递的（截止日期未过；截止为空/格式无法识别的一律保留） */
  openOnly?: boolean;
  /** 排序（不传 = 默认：重点优先 → 更新日期） */
  sort?: CampusSort;
  limit?: number;
  /** 分页偏移（配合 limit 使用） */
  offset?: number;
}

/** 公司维度聚合（「可以投递哪些公司」用）。 */
export interface CampusCompany {
  company: string;
  /** 该公司在库条目数（≈ 可投岗位/批次条目数） */
  count: number;
  /** 重点条目数 */
  keyCount: number;
  /** 最近更新日期 */
  latestUpdate: string | null;
  batches: string[];
  locations: string[];
  industries: string[];
}

export interface CampusListResult {
  rows: CampusRecruit[];
  /** 命中总数（用于分页） */
  total: number;
  /** 是否还有下一页 */
  limited: boolean;
  /** 本页偏移 */
  offset: number;
  /** 本页条数上限 */
  limit: number;
}

export interface CampusStats {
  total: number;
  today: number;
  week: number;
  keyCount: number;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface CampusFacets {
  batch: FacetValue[];
  industry: FacetValue[];
  nature: FacetValue[];
  month: FacetValue[];
  location: FacetValue[];
  linkSource: FacetValue[];
}

export type CampusFacetKey = keyof CampusFacets;

/** 可筛选的列（UI 与查询共用一份定义）。sort：count=按数量，value=按值倒序（月份/批次更自然）。 */
export const CAMPUS_FACET_COLUMNS: {
  key: CampusFacetKey;
  column: string;
  label: string;
  sort: "count" | "value";
}[] = [
  { key: "batch", column: "batch", label: "批次", sort: "value" },
  { key: "month", column: "month", label: "收录月份", sort: "value" },
  { key: "industry", column: "industry", label: "行业", sort: "count" },
  { key: "nature", column: "nature", label: "性质", sort: "count" },
  { key: "location", column: "location", label: "工作地点", sort: "count" },
  { key: "linkSource", column: "link_source", label: "信息来源", sort: "count" },
];

/* ---------------- 行映射 ---------------- */

interface Row {
  id: string;
  company: string;
  batch: string | null;
  positions: string | null;
  location: string | null;
  industry: string | null;
  nature: string | null;
  month: string | null;
  update_date: string | null;
  full_date: string | null;
  deadline: string | null;
  deadline_iso: string | null;
  app_link: string | null;
  source_link: string | null;
  link_source: string | null;
  evaluation: string | null;
  is_key: number;
  is_commercial: number;
  commercial_expiry: string | null;
  is_featured_card: number;
  first_seen_at: number;
  updated_at: number;
}

const CAMPUS_COLS =
  "id, company, batch, positions, location, industry, nature, month, update_date, full_date, " +
  "deadline, deadline_iso, app_link, source_link, link_source, evaluation, is_key, is_commercial, " +
  "commercial_expiry, is_featured_card, first_seen_at, updated_at";

function toRecruit(r: Row): CampusRecruit {
  return {
    id: r.id,
    company: r.company,
    batch: r.batch,
    positions: r.positions,
    location: r.location,
    industry: r.industry,
    nature: r.nature,
    month: r.month,
    updateDate: r.update_date,
    fullDate: r.full_date,
    deadline: r.deadline,
    deadlineIso: r.deadline_iso,
    appLink: r.app_link,
    sourceLink: r.source_link,
    linkSource: r.link_source,
    evaluation: r.evaluation,
    isKey: r.is_key === 1,
    isCommercial: r.is_commercial === 1,
    commercialExpiry: r.commercial_expiry,
    isFeaturedCard: r.is_featured_card === 1,
    firstSeenAt: r.first_seen_at,
    updatedAt: r.updated_at,
  };
}

/** 多值字段拆分（地点/行业/岗位在源站可能是数组，落库时以 , 连接）。 */
export function splitValues(v: string | null | undefined): string[] {
  if (!v) return [];
  return v
    .split(/[,，、;；|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ---------------- 查询 ---------------- */

function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * 排序 SQL。
 *
 * 两个关键点：
 * ① **「没有截止时间的排在最后」**：源站有近 1/4 是「招满为止/尽快投递」这类没有日期的文本，
 *    正序时若按 NULL 默认行为会把它们全挤到最前面，所以用 `deadline_iso IS NULL` 显式压到最后；
 *    这一堆内部按更新日期倒序（CASE 让它们在该键上并列）。
 * ② **更新时间用 full_date 而不是 update_date**：源站 update_date 是 `8.28`/`9.14` 这种
 *    「月.日」无年份格式，字符串排序会让 10/11/12 月错位（`10.5` < `8.28`）。
 */
function buildOrderBy(sort?: CampusSort): string {
  const dir = sort?.dir === "asc" ? "ASC" : "DESC";
  switch (sort?.key) {
    case "update":
      return `ORDER BY (full_date IS NULL OR full_date = '') ASC, full_date ${dir}, update_date ${dir}, is_key DESC`;
    case "deadline":
      return `ORDER BY (deadline_iso IS NULL) ASC, deadline_iso ${dir}, is_key DESC, full_date DESC`;
    case "firstSeen":
      return `ORDER BY first_seen_at ${dir}, id ${dir}`;
    case "company":
      return `ORDER BY company ${dir}, is_key DESC, full_date DESC`;
    default:
      return "ORDER BY is_key DESC, full_date DESC, first_seen_at DESC";
  }
}

function buildWhere(q: CampusQuery | undefined, params: (string | number)[]): string {
  const where: string[] = [];
  const push = (v: string | number): string => {
    params.push(v);
    return `$${params.length}`;
  };
  /** 同一列多值 = OR（多选），列与列之间 AND。 */
  const multi = (column: string, values?: string[]) => {
    const vals = (values ?? []).map((v) => v.trim()).filter(Boolean);
    if (vals.length === 0) return;
    const parts = vals.map((v) => `${column} LIKE ${push(`%${escapeLike(v)}%`)} ESCAPE '\\'`);
    where.push(`(${parts.join(" OR ")})`);
  };

  const company = q?.company?.trim();
  if (company) where.push(`company LIKE ${push(`%${escapeLike(company)}%`)} ESCAPE '\\'`);

  multi("batch", q?.batch);
  multi("industry", q?.industry);
  multi("nature", q?.nature);
  multi("month", q?.month);
  multi("location", q?.location);
  multi("link_source", q?.linkSource);

  if (q?.onlyKey) where.push("is_key = 1");

  if (q?.openOnly) {
    // 归一化后没有截止日期（招满为止/尽快投递/空）的无法判断，保留；有日期的要求不早于今天
    where.push(`(deadline_iso IS NULL OR deadline_iso >= ${push(localToday())})`);
  }

  const kw = q?.keyword?.trim();
  if (kw) {
    const p = push(`%${escapeLike(kw)}%`);
    where.push(
      `(company LIKE ${p} ESCAPE '\\' OR positions LIKE ${p} ESCAPE '\\' OR location LIKE ${p} ESCAPE '\\'` +
        ` OR industry LIKE ${p} ESCAPE '\\' OR nature LIKE ${p} ESCAPE '\\'` +
        ` OR link_source LIKE ${p} ESCAPE '\\' OR evaluation LIKE ${p} ESCAPE '\\')`,
    );
  }

  return where.length ? `WHERE ${where.join(" AND ")}` : "";
}

/** 列表：多列筛选 + 关键词检索 + 排序（分页：limit + offset）。 */
export async function listCampusRecruits(query?: CampusQuery): Promise<CampusListResult> {
  const db = getDb();
  const params: (string | number)[] = [];
  const where = buildWhere(query, params);
  const orderBy = buildOrderBy(query?.sort);
  const limit = Math.min(Math.max(query?.limit ?? 50, 1), 500);
  const offset = Math.max(query?.offset ?? 0, 0);

  const counted = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM campus_recruits ${where}`,
    params,
  );
  const total = counted[0]?.n ?? 0;

  const rows = await db.select<Row[]>(
    `SELECT ${CAMPUS_COLS} FROM campus_recruits ${where}
     ${orderBy}
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  return { rows: rows.map(toRecruit), total, limited: offset + rows.length < total, offset, limit };
}

/** 全部收录条目数（清空确认/统计用）。 */
export async function countCampusRecruits(): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM campus_recruits");
  return rows[0]?.n ?? 0;
}

/**
 * 公司维度汇总：去重后的公司清单 + 条目数/批次/地点（「可以投递哪些公司」用）。
 * 筛选条件与列表一致（关键词/批次/行业/地点/仅重点/仅未截止…）。
 */
export async function listCampusCompanies(
  query?: CampusQuery,
): Promise<{ rows: CampusCompany[]; total: number }> {
  const db = getDb();
  const params: (string | number)[] = [];
  const where = buildWhere(query, params);
  const limit = Math.min(Math.max(query?.limit ?? 50, 1), 500);

  const counted = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM (SELECT 1 FROM campus_recruits ${where} GROUP BY company)`,
    params,
  );
  const total = counted[0]?.n ?? 0;

  const rows = await db.select<
    {
      company: string;
      n: number;
      keys: number;
      latest: string | null;
      batches: string | null;
      locations: string | null;
      industries: string | null;
    }[]
  >(
    `SELECT company,
            COUNT(*) AS n,
            SUM(is_key) AS keys,
            MAX(update_date) AS latest,
            GROUP_CONCAT(DISTINCT batch) AS batches,
            GROUP_CONCAT(DISTINCT location) AS locations,
            GROUP_CONCAT(DISTINCT industry) AS industries
     FROM campus_recruits ${where}
     GROUP BY company
     ${
       query?.sort?.key === "company"
         ? `ORDER BY company ${query.sort.dir === "asc" ? "ASC" : "DESC"}`
         : "ORDER BY keys DESC, latest DESC, n DESC, company"
     }
     LIMIT ${limit}`,
    params,
  );

  return {
    total,
    rows: rows.map((r) => ({
      company: r.company,
      count: r.n,
      keyCount: r.keys ?? 0,
      latestUpdate: r.latest,
      batches: dedupe(splitValues(r.batches)),
      locations: dedupe(splitValues(r.locations)),
      industries: dedupe(splitValues(r.industries)),
    })),
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/** 顶部统计：总数 / 今日新增 / 近 7 天新增 / 重点数。 */
export async function campusStats(): Promise<CampusStats> {
  const db = getDb();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const rows = await db.select<{ total: number; today: number | null; week: number | null; keys: number | null }[]>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN first_seen_at >= $1 THEN 1 ELSE 0 END) AS today,
            SUM(CASE WHEN first_seen_at >= $2 THEN 1 ELSE 0 END) AS week,
            SUM(CASE WHEN is_key = 1 THEN 1 ELSE 0 END) AS keys
     FROM campus_recruits`,
    [dayStart.getTime(), Date.now() - 7 * 86_400_000],
  );
  const r = rows[0];
  return {
    total: r?.total ?? 0,
    today: r?.today ?? 0,
    week: r?.week ?? 0,
    keyCount: r?.keys ?? 0,
  };
}

/** 各筛选列的候选值 + 计数（多值字段先拆分再统计）。 */
export async function campusFacets(): Promise<CampusFacets> {
  const db = getDb();
  const out: CampusFacets = {
    batch: [],
    industry: [],
    nature: [],
    month: [],
    location: [],
    linkSource: [],
  };

  for (const facet of CAMPUS_FACET_COLUMNS) {
    const rows = await db.select<{ v: string | null }[]>(
      `SELECT ${facet.column} AS v FROM campus_recruits
       WHERE ${facet.column} IS NOT NULL AND ${facet.column} <> ''`,
    );
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const value of splitValues(row.v)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const list = [...counts.entries()].map(([value, count]) => ({ value, count }));
    list.sort((a, b) =>
      facet.sort === "value"
        ? b.value.localeCompare(a.value, "zh-CN", { numeric: true })
        : b.count - a.count || b.value.localeCompare(a.value, "zh-CN"),
    );
    out[facet.key] = list;
  }
  return out;
}

/* ---------------- 去重入库 ---------------- */

const INSERT_COLS = [
  "id",
  "dedupe_key",
  "company",
  "batch",
  "positions",
  "location",
  "industry",
  "nature",
  "month",
  "update_date",
  "full_date",
  "deadline",
  "deadline_iso",
  "app_link",
  "source_link",
  "link_source",
  "evaluation",
  "is_key",
  "is_commercial",
  "commercial_expiry",
  "is_featured_card",
  "raw_json",
  "first_seen_at",
  "updated_at",
];

/** 冲突时刷新的列（不含 id / dedupe_key / first_seen_at：首次收录时间保持不动）。 */
const CONFLICT_UPDATE_COLS = INSERT_COLS.filter(
  (c) => c !== "id" && c !== "dedupe_key" && c !== "first_seen_at",
);

/** 每批行数：23 列 × 40 = 920 个绑定参数，稳在 SQLite 变量上限内。 */
const UPSERT_BATCH = 40;

export interface UpsertStats {
  total: number;
  created: number;
  updated: number;
}

function toColumns(it: CampusRecordInput, now: number): Record<string, string | number | null> {
  return {
    id: crypto.randomUUID(),
    dedupe_key: it.dedupeKey,
    company: it.company,
    batch: it.batch,
    positions: it.positions,
    location: it.location,
    industry: it.industry,
    nature: it.nature,
    month: it.month,
    update_date: it.updateDate,
    full_date: it.fullDate,
    deadline: it.deadline,
    deadline_iso: it.deadlineIso,
    app_link: it.appLink,
    source_link: it.sourceLink,
    link_source: it.linkSource,
    evaluation: it.evaluation,
    is_key: it.isKey ? 1 : 0,
    is_commercial: it.isCommercial ? 1 : 0,
    commercial_expiry: it.commercialExpiry,
    is_featured_card: it.isFeaturedCard ? 1 : 0,
    raw_json: JSON.stringify(it.raw ?? {}),
    first_seen_at: now,
    updated_at: now,
  };
}

/**
 * 批量去重入库：dedupe_key 命中则刷新字段（保留 first_seen_at），未命中则新增。
 * 返回新增/刷新条数用于 UI 反馈。
 */
export async function upsertCampusRecruits(items: CampusRecordInput[]): Promise<UpsertStats> {
  if (items.length === 0) return { total: 0, created: 0, updated: 0 };
  const db = getDb();

  // 1) 先查已存在的去重键（分块 IN，避开参数上限）
  const keys = items.map((i) => i.dedupeKey);
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const ph = chunk.map((_, j) => `$${j + 1}`).join(",");
    const rows = await db.select<{ dedupe_key: string }[]>(
      `SELECT dedupe_key FROM campus_recruits WHERE dedupe_key IN (${ph})`,
      chunk,
    );
    for (const r of rows) existing.add(r.dedupe_key);
  }

  // 2) 分批 UPSERT
  const now = Date.now();
  for (let i = 0; i < items.length; i += UPSERT_BATCH) {
    const chunk = items.slice(i, i + UPSERT_BATCH);
    const values: string[] = [];
    const params: (string | number | null)[] = [];
    for (const it of chunk) {
      const row = toColumns(it, now);
      const holders = INSERT_COLS.map((col) => {
        params.push(row[col] ?? null);
        return `$${params.length}`;
      });
      values.push(`(${holders.join(",")})`);
    }
    await db.execute(
      `INSERT INTO campus_recruits (${INSERT_COLS.join(",")}) VALUES ${values.join(",")}
       ON CONFLICT(dedupe_key) DO UPDATE SET ${CONFLICT_UPDATE_COLS.map((c) => `${c} = excluded.${c}`).join(", ")}`,
      params,
    );
  }

  // 3) 统计（同批次内重复键只算一次新增）
  const seen = new Set<string>();
  let created = 0;
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    if (!existing.has(k)) created++;
  }
  return { total: items.length, created, updated: items.length - created };
}

export async function deleteCampusRecruit(id: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM campus_recruits WHERE id = $1", [id]);
}

/**
 * 一次性回填 `deadline_iso`：老库（scout:2 迁移之前入库）没有归一化日期。
 * 应用启动时跑一次；跑完再调用就是一次空查询（无 `deadline_iso IS NULL` 的行）。
 * 按「归一化结果」分组批量 UPDATE（源站 251 种取值 → 约 250 条语句，而不是 9461 条）。
 */
export async function backfillDeadlineIso(): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ id: string; deadline: string | null; full_date: string | null }[]>(
    `SELECT id, deadline, full_date FROM campus_recruits
     WHERE deadline IS NOT NULL AND deadline <> '' AND deadline_iso IS NULL
     LIMIT 8000`,
  );
  if (rows.length === 0) return 0;

  const byIso = new Map<string, string[]>();
  for (const r of rows) {
    const iso = parseDeadline(r.deadline, r.full_date);
    if (!iso) continue; // 招满为止/尽快投递 → 保持 NULL（排序时排最后）
    const list = byIso.get(iso);
    if (list) list.push(r.id);
    else byIso.set(iso, [r.id]);
  }

  let updated = 0;
  for (const [iso, ids] of byIso) {
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      const holders = chunk.map((_, j) => `$${j + 2}`).join(",");
      await db.execute(
        `UPDATE campus_recruits SET deadline_iso = $1 WHERE id IN (${holders})`,
        [iso, ...chunk],
      );
      updated += chunk.length;
    }
  }
  return updated;
}

/** 清空全部收录（危险操作，调用方需先确认）。 */
export async function deleteAllCampusRecruits(): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM campus_recruits", []);
}
