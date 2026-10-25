import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { errMsg } from "../../lib/error";
import { parseDeadline } from "../../lib/deadline";
import {
  upsertCampusRecruits,
  type CampusRecordInput,
  type UpsertStats,
} from "./service";

/**
 * 校招信息抓取（由 campus_recruit_crawler.py 移植到前端）：
 * 1. 读取汇总页 → 解析内联的数据清单 `const META = { files: [...], total: N }`
 * 2. 逐个下载分片 `data/<name>.json`（失败重试 + 分片间限速）
 * 3. 字段归一化 → 计算去重键（网申链接优先，缺失时取 公司+批次+岗位）
 * 4. 去重入库（已存在的只刷新字段，不新增）
 *
 * 请求经 tauri-plugin-http 原生发出（不受 CORS 限制，capabilities 已放开 https://*）。
 */

export const CAMPUS_PAGE_URL =
  "https://campus.sma-wiki.cn/campus/campus_recruit.html?channel=bz";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
/** 分片之间的间隔（对源站友好，避免被限流） */
const SHARD_DELAY_MS = 150;

export class CrawlError extends Error {}

export interface CrawlProgress {
  phase: "manifest" | "shards" | "saving";
  message: string;
  /** 分片进度 */
  done?: number;
  total?: number;
  /** 已解析记录数 */
  records?: number;
}

export interface CrawlResult extends UpsertStats {
  /** 源站解析出的记录数（同批去重前） */
  fetched: number;
  /** 分片数量 */
  shards: number;
  /** 页面清单声明的总数 */
  declaredTotal: number;
  /** 同一批次内被去重键合并掉的条数 */
  dupInBatch: number;
  /** 字段缺失被跳过的条数 */
  skipped: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function timeout(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

/** GET 文本：429/5xx 与网络错误自动重试，4xx 直接失败。 */
async function getText(
  url: string,
  accept: string,
  onRetry?: (message: string) => void,
): Promise<string> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await Promise.race([
        tauriFetch(url, {
          method: "GET",
          headers: { Accept: accept, "User-Agent": "Rill/0.1 (campus recruit sync)" },
          connectTimeout: REQUEST_TIMEOUT_MS,
        }),
        timeout(REQUEST_TIMEOUT_MS, `请求超时（${REQUEST_TIMEOUT_MS / 1000}s）`),
      ]);
      if (res.ok) {
        return (await res.text()).replace(/^\uFEFF/, "");
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) throw new CrawlError(`服务器返回 HTTP ${res.status}`);
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      if (e instanceof CrawlError) throw e;
      lastError = errMsg(e);
    }
    if (attempt < MAX_ATTEMPTS) {
      const delay = Math.min(400 * 2 ** (attempt - 1), 4000);
      onRetry?.(`请求失败（${lastError}），${(delay / 1000).toFixed(1)}s 后重试（${attempt}/${MAX_ATTEMPTS}）…`);
      await sleep(delay);
    }
  }
  throw new CrawlError(`网络请求失败（已重试 ${MAX_ATTEMPTS} 次）：${lastError}`);
}

/**
 * 解析页面内联的数据清单：定位 `const META =`，用括号配平（跳过字符串内的括号）取出 JSON。
 * 同步自 Python 版 parse_manifest，含分片文件名的安全校验。
 */
export function parseManifest(html: string): { files: string[]; total: number } {
  const match = /\bconst\s+META\s*=\s*/.exec(html);
  if (!match) throw new CrawlError("页面中未找到数据清单 const META（源站结构可能已变更）");

  const start = html.indexOf("{", match.index + match[0].length);
  if (start < 0) throw new CrawlError("数据清单 META 格式错误");

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new CrawlError("数据清单 META 未闭合");

  let meta: unknown;
  try {
    meta = JSON.parse(html.slice(start, end));
  } catch (e) {
    throw new CrawlError(`数据清单 META 不是有效 JSON：${errMsg(e)}`);
  }

  const files = (meta as { files?: unknown }).files;
  const total = (meta as { total?: unknown }).total;
  if (!Array.isArray(files) || files.length === 0) throw new CrawlError("数据清单 META.files 为空或格式错误");
  if (typeof total !== "number" || !Number.isFinite(total) || total < 1) {
    throw new CrawlError("数据清单 META.total 缺失或格式错误");
  }

  const safe: string[] = [];
  for (const name of files) {
    if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes("..")) {
      throw new CrawlError("数据清单包含不安全的分片文件名");
    }
    if (safe.includes(name)) throw new CrawlError(`数据清单包含重复分片：${name}`);
    safe.push(name);
  }
  return { files: safe, total };
}

/* ---------------- 字段归一化 ---------------- */

/** 任意值 → 去空白文本（数组以 , 连接；对象转 JSON）。空值一律 null。 */
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    const parts = value.map(text).filter((s): s is string => Boolean(s));
    return parts.length ? parts.join(",") : null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/** 任意值 → 布尔标记（兼容 1/0、"true"/"是"/"重点"）。 */
function flag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "是" || s === "重点";
  }
  return false;
}

const REQUIRED = ["company"] as const;

/** 校验分片负载：返回可用记录与跳过数（缺公司名的条目直接丢弃）。 */
export function readRecords(payload: unknown): { records: Record<string, unknown>[]; skipped: number } {
  if (!Array.isArray(payload)) throw new CrawlError("数据格式错误：分片 JSON 顶层必须是数组");
  const records: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const item of payload) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      skipped++;
      continue;
    }
    const record = item as Record<string, unknown>;
    if (REQUIRED.some((f) => !text(record[f]))) {
      skipped++;
      continue;
    }
    records.push(record);
  }
  return { records, skipped };
}

/**
 * 去重键：
 * - 网申链接在【本批次内唯一】时用链接（link:xxx）——链接才是投递入口
 * - 否则用 公司+批次+岗位（cp:…）——避免源站把同一链接挂在多条记录上时误合并
 * 两者都对同一次抓取幂等：源站数据不变 → 键不变 → 只刷新不新增。
 */
export function buildDedupeKeys(records: Record<string, unknown>[]): string[] {
  const linkKeys = records.map((r) => text(r.appLink));
  const linkCount = new Map<string, number>();
  for (const k of linkKeys) if (k) linkCount.set(k, (linkCount.get(k) ?? 0) + 1);

  return records.map((r, i) => {
    const link = linkKeys[i];
    if (link && linkCount.get(link) === 1) return `link:${link}`;
    return `cp:${[text(r.company) ?? "", text(r.batch) ?? "", text(r.positions) ?? ""].join("\u0001")}`;
  });
}

/** 单条源记录 → 入库结构。 */
export function toRecordInput(record: Record<string, unknown>, dedupeKey: string): CampusRecordInput {
  const fullDate = text(record.fullDate);
  const deadline = text(record.deadline);
  return {
    dedupeKey,
    company: text(record.company) ?? "",
    batch: text(record.batch),
    positions: text(record.positions),
    location: text(record.location),
    industry: text(record.industry),
    nature: text(record.nature),
    month: text(record.month),
    updateDate: text(record.updateDate),
    fullDate,
    deadline,
    // 截止时间是自由文本（2026/11/9、招满为止、尽快投递…）：归一化成 YYYY-MM-DD 供排序与
    // 过期判断，原文仍存 deadline 用于展示；无法识别的为 null → 排序时排最后。
    deadlineIso: parseDeadline(deadline, fullDate),
    appLink: text(record.appLink),
    sourceLink: text(record.sourceLink),
    linkSource: text(record.linkSource),
    evaluation: text(record.evaluation),
    isKey: flag(record.isKey),
    isCommercial: flag(record.isCommercial),
    commercialExpiry: text(record.commercialExpiry),
    isFeaturedCard: flag(record.isFeaturedCard),
    raw: record,
  };
}

/* ---------------- 主流程 ---------------- */

/**
 * 抓取 + 去重入库（页面「抓取并入库」按钮与 scout_refresh 工具的唯一入口）。
 */
export async function crawlCampusRecruits(
  onProgress?: (p: CrawlProgress) => void,
): Promise<CrawlResult> {
  onProgress?.({ phase: "manifest", message: "正在读取数据清单…" });
  const html = await getText(CAMPUS_PAGE_URL, "text/html,application/xhtml+xml,*/*");
  const { files, total: declaredTotal } = parseManifest(html);

  const records: Record<string, unknown>[] = [];
  let skipped = 0;
  for (let i = 0; i < files.length; i++) {
    const name = files[i];
    const url = new URL(`data/${name}.json`, CAMPUS_PAGE_URL).href;
    const body = await getText(url, "application/json,*/*", (msg) =>
      onProgress?.({ phase: "shards", message: msg, done: i, total: files.length, records: records.length }),
    );
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      throw new CrawlError(`分片 ${name} 不是有效 JSON：${errMsg(e)}`);
    }
    const parsed = readRecords(payload);
    records.push(...parsed.records);
    skipped += parsed.skipped;
    onProgress?.({
      phase: "shards",
      message: `已读取批次 ${i + 1}/${files.length}：${name}（${parsed.records.length} 条）`,
      done: i + 1,
      total: files.length,
      records: records.length,
    });
    if (i < files.length - 1) await sleep(SHARD_DELAY_MS);
  }

  // 同批次内去重：同一去重键只保留第一条（并计数，便于反馈"源内重复"）
  const byKey = new Map<string, Record<string, unknown>>();
  const keys = buildDedupeKeys(records);
  let dupInBatch = 0;
  records.forEach((record, i) => {
    const key = keys[i];
    const kept = byKey.get(key);
    if (!kept) {
      byKey.set(key, record);
      return;
    }
    dupInBatch++;
    // 同键记录若字段更"新"（更新日期更晚）则替换保留的那条
    const newer = (text(record.updateDate) ?? "") > (text(kept.updateDate) ?? "");
    if (newer) byKey.set(key, record);
  });

  const inputs = [...byKey.entries()].map(([key, record]) => toRecordInput(record, key));
  onProgress?.({
    phase: "saving",
    message: `去重后 ${inputs.length} 条，正在写入数据库…`,
    records: inputs.length,
  });

  const stats = await upsertCampusRecruits(inputs);
  onProgress?.({ phase: "saving", message: "入库完成", records: inputs.length });

  return {
    ...stats,
    fetched: records.length,
    shards: files.length,
    declaredTotal,
    dupInBatch,
    skipped,
  };
}
