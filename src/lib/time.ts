import { startOfWeek as dfStartOfWeek, addDays, format } from "date-fns";

export const DAY_MS = 86_400_000;
export const WEEK_STARTS_ON = 1 as const; // 周一

export function startOfWeek(d: Date): Date {
  return dfStartOfWeek(d, { weekStartsOn: WEEK_STARTS_ON });
}

/** 某周（周一开头）的 7 天。 */
export function weekDays(d: Date): Date[] {
  const s = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function fmtDay(ms: number): string {
  return format(new Date(ms), "M月d日");
}

export function fmtTime(ms: number): string {
  return format(new Date(ms), "HH:mm");
}

/** datetime-local input 的本地值（yyyy-MM-ddTHH:mm）。 */
export function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(v: string): number {
  return new Date(v).getTime();
}
