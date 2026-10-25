/** 表格排序键。 */
export type SortKey = "company" | "position" | "status" | "applied_at";

/** 时间戳 → `<input type="date">` 需要的 `YYYY-MM-DD`（本地时区）。 */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 投递日期展示（中文本地化）。 */
export function formatAppliedAt(ms: number): string {
  return new Date(ms).toLocaleDateString("zh-CN");
}
