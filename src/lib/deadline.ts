/**
 * 截止时间归一化。
 *
 * 源站 `deadline` 字段是**自由文本**，实测 251 种取值（9461 条记录）：
 * - `2026/11/9`（5018 条，主力格式）
 * - `招满为止`（1230）/ `招满即止`（247）/ `尽快投递`（79）→ 没有具体日期，视为「无截止」
 * - `5.18`、`5.28`（省略年份）、`2026年6月 14`、`2 月 13 日中午 12 点`
 *
 * 统一解析成 `YYYY-MM-DD` 存进 `deadline_iso`，排序与「还能投递」判断都用它
 * （直接拿原文做字符串比较会全错：`2026/11/9` 跟 `2026-11-09` 不是一个东西）。
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 从记录里的完整日期（`2026-08-28`）取年份，用于补全省略年份的截止时间。 */
function yearFrom(hint: string | null | undefined): number {
  const m = /(\d{4})/.exec(hint ?? "");
  return m ? Number(m[1]) : new Date().getFullYear();
}

/**
 * 解析截止时间为 `YYYY-MM-DD`；无法识别（招满为止/尽快投递/空）返回 null。
 * @param raw 源站原文
 * @param yearHint 记录里的完整日期，用于「5.18」「2 月 13 日」这类省略年份的写法
 */
export function parseDeadline(raw: string | null | undefined, yearHint?: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;

  // 2026/11/9、2026-11-9、2026.11.9（允许后面跟着说明文字）
  let m = /^(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?!\d)/.exec(s);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));

  // 2026年6月14日 / 2026年6月 14
  m = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/.exec(s);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));

  // 2月13日中午12点 / 2 月 13 日（省略年份 → 用记录年份补）
  m = /^(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(s);
  if (m) return toIso(yearFrom(yearHint), Number(m[1]), Number(m[2]));

  // 5.18 / 5/18（省略年份）
  m = /^(\d{1,2})\s*[/.]\s*(\d{1,2})(?!\d)/.exec(s);
  if (m) return toIso(yearFrom(yearHint), Number(m[1]), Number(m[2]));

  // 20261109
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));

  return null;
}

/** 展示用：能解析成日期就显示标准日期，否则显示原文（如「招满为止」）。 */
export function displayDeadline(iso: string | null, raw: string | null): string | null {
  return iso ?? raw ?? null;
}

/** 本机时区的今天（YYYY-MM-DD）。 */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
