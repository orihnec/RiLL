export interface DateRules { year: number | null; order: "mdy" | "dmy" | null; }
export interface ParsedImportDate {
  value: number | null;
  precision: "date" | "datetime" | "unknown";
  warning: string | null;
}

const unknown = (warning: string | null): ParsedImportDate => ({ value: null, precision: "unknown", warning });

function localDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number | null {
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, second);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : null;
}

function result(value: number | null, hasTime: boolean): ParsedImportDate {
  return value === null ? unknown("日期无效，需人工核对") : { value, precision: hasTime ? "datetime" : "date", warning: null };
}

function textDate(text: string, rules: DateRules): ParsedImportDate {
  const full = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (full) return result(localDate(Number(full[1]), Number(full[2]), Number(full[3]),
    Number(full[4] || 0), Number(full[5] || 0), Number(full[6] || 0)), Boolean(full[4]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(text);
  if (iso) {
    if (localDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) === null) return unknown("日期无效，需人工核对");
    const value = Date.parse(text);
    return result(Number.isFinite(value) ? value : null, true);
  }
  const chinese = /^(\d{1,2})月(\d{1,2})日?$/.exec(text);
  const separated = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/.exec(text);
  if (chinese || separated) {
    const year = separated?.[3] ? Number(separated[3]) : rules.year;
    if (year === null) return unknown("日期缺少年份，请确认源表年份");
    if (chinese) return result(localDate(year, Number(chinese[1]), Number(chinese[2])), false);
    if (!rules.order) return unknown("日期顺序有歧义，请确认月/日或日/月");
    const first = Number(separated![1]);
    const second = Number(separated![2]);
    return result(localDate(year, rules.order === "mdy" ? first : second, rules.order === "mdy" ? second : first), false);
  }
  return unknown("无法确认投递日期，保留原文供核对");
}

export function parseImportDate(value: unknown, encoding: "text" | "base-timestamp" | "sheets-serial",
  rules: DateRules = { year: null, order: null }): ParsedImportDate {
  if (value === undefined || value === null || value === "") return unknown(null);
  if (encoding === "base-timestamp") {
    return typeof value === "number" && Number.isFinite(value) && Number.isFinite(new Date(value).getTime())
      ? result(value, true) : unknown("多维表格日期值不是有效毫秒时间戳");
  }
  if (encoding === "sheets-serial" && typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) value = Number(value);
  if (encoding === "sheets-serial" && typeof value === "number") {
    if (!Number.isFinite(value) || value < 1 || value > 2_958_465) return unknown("工作表日期序列无效");
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000));
    return result(localDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
      date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()), value % 1 !== 0);
  }
  if (typeof value !== "string") return unknown("日期格式未确认，请核对字段类型");
  return textDate(value.trim(), rules);
}
