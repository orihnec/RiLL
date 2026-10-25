import type { CampusFacetKey, CampusFacets, CampusRecruit } from "./service";

/** 筛选条件（每列可多选，列间 AND）。 */
export type FacetSelection = Record<CampusFacetKey, string[]>;

export const EMPTY_SELECTION: FacetSelection = {
  batch: [],
  month: [],
  industry: [],
  nature: [],
  location: [],
  linkSource: [],
};

export const EMPTY_FACETS: CampusFacets = {
  batch: [],
  month: [],
  industry: [],
  nature: [],
  location: [],
  linkSource: [],
};

export const PAGE_SIZES = [50, 100, 200];

/** 投递到求职监控时职位名的截断长度（决定与已有投递记录的比对键）。 */
export const POSITION_LIMIT = 50;

export function positionOf(r: CampusRecruit): string {
  return (r.positions ?? r.batch ?? "校招").slice(0, POSITION_LIMIT);
}

/** 公司 + 职位 = 去重键（判断是否已同步到求职监控）。 */
export function jobKeyOf(company: string, position: string): string {
  return `${company}\u0001${position}`;
}

/** 投递页面地址：优先网申链接，缺省退回信息来源页。 */
export function applyUrlOf(r: CampusRecruit): string | null {
  return r.appLink ?? r.sourceLink;
}

/** 截止日期是否已过（用归一化后的 YYYY-MM-DD；无法识别的返回 false）。 */
export function isExpired(deadlineIso: string | null): boolean {
  if (!deadlineIso) return false;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return deadlineIso < today;
}

/** 展示用截止时间：归一化日期优先，否则显示源站原文（招满为止 / 尽快投递）。 */
export function deadlineLabel(r: CampusRecruit): string | null {
  return r.deadlineIso ?? r.deadline ?? null;
}

/** 卡片上的截止文案。 */
export function deadlineText(r: CampusRecruit): string {
  const label = deadlineLabel(r);
  return label ? `截止 ${label}` : "截止 —";
}
