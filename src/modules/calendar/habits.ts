import { startOfDay } from "date-fns";
import * as service from "./service";

/**
 * 习惯 = **带每周 RRULE 的重复事件**。
 *
 * 不建新表、不做"每天自动复制"：事件表本来就有 rrule + 展开逻辑（拖拽/编辑/删除全覆盖），
 * 习惯只是给它一个友好的增删入口。改一次就作用于所有未来的日子，撤销即删除。
 */

/** 0=周日 … 6=周六（与 Date.getDay() 对齐）。 */
export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export interface Habit {
  id: string;
  title: string;
  /** 选中的星期（0=周日） */
  days: number[];
  /** 每天开始时间（从 00:00 起的分钟数） */
  startMinutes: number;
  durationMinutes: number;
  category: string;
}

export interface HabitInput {
  title: string;
  days: number[];
  /** "HH:mm" */
  time: string;
  durationMinutes: number;
  category?: string;
}

const minutesOf = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** 从 rrule 里读回星期集合（读不出就当作每天）。 */
function daysOf(rrule: string): number[] {
  const m = rrule.match(/BYDAY=([A-Z,]+)/);
  if (!m) return [0, 1, 2, 3, 4, 5, 6];
  return m[1]
    .split(",")
    .map((d) => BYDAY.indexOf(d))
    .filter((d) => d >= 0);
}

/** 列出全部习惯（按开始时间排序）。 */
export async function listHabits(): Promise<Habit[]> {
  const rows = await service.listRecurring();
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      days: daysOf(r.rrule ?? ""),
      startMinutes: (r.start_at - startOfDay(new Date(r.start_at)).getTime()) / 60_000,
      durationMinutes: Math.round((r.end_at - r.start_at) / 60_000),
      category: r.category,
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

/** 新建习惯：以今天为 DTSTART，按选中的星期每周重复。 */
export async function createHabit(input: HabitInput): Promise<string> {
  const startMinutes = minutesOf(input.time);
  const start = startOfDay(new Date()).getTime() + startMinutes * 60_000;
  const byday = [...new Set(input.days)].sort().map((d) => BYDAY[d]).join(",");
  if (!byday) throw new Error("至少选一天");
  return service.createEvent({
    title: input.title.trim() || "新习惯",
    startAt: start,
    endAt: start + Math.max(5, input.durationMinutes) * 60_000,
    category: input.category ?? "default",
    rrule: `FREQ=WEEKLY;BYDAY=${byday}`,
  });
}

export async function deleteHabit(id: string): Promise<void> {
  await service.deleteEvent({ id, occurrenceStart: null });
}

export { hhmm as habitTimeLabel };
