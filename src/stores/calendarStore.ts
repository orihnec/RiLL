import { create } from "zustand";
import {
  startOfWeek,
  addDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  endOfWeek,
} from "date-fns";
import * as service from "../modules/calendar/service";
import type { Occurrence } from "../modules/calendar/service";

export type View = "week" | "month";

/** 视图对应的查询区间（周 = 当周 7 天；月 = 完整网格，含首尾周）。 */
function rangeFor(view: View, d: Date): [number, number] {
  if (view === "week") {
    const s = startOfWeek(d, { weekStartsOn: 1 });
    return [s.getTime(), addDays(s, 7).getTime()];
  }
  const gridStart = startOfWeek(startOfMonth(d), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(d), { weekStartsOn: 1 });
  return [gridStart.getTime(), gridEnd.getTime() + 1];
}

interface CalendarState {
  view: View;
  viewDate: Date;
  occurrences: Occurrence[];
  status: "idle" | "loading" | "error";
  error: string | null;
  /** 当前视图区间（用于增量刷新） */
  range: [number, number] | null;

  setView: (view: View) => void;
  setViewDate: (d: Date) => void;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
  reload: () => Promise<void>;
  createEvent: (input: service.NewEventInput) => Promise<string>;
  updateEvent: (target: service.EventTarget, patch: service.EventPatch) => Promise<void>;
  deleteEvent: (target: service.EventTarget) => Promise<void>;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  view: "week",
  viewDate: new Date(),
  occurrences: [],
  status: "idle",
  error: null,
  range: null,

  setView: (view) => {
    set({ view });
    void get().reload();
  },
  setViewDate: (viewDate) => {
    set({ viewDate });
    void get().reload();
  },
  goPrev: () => {
    const { view, viewDate } = get();
    get().setViewDate(view === "week" ? addDays(viewDate, -7) : addMonths(viewDate, -1));
  },
  goNext: () => {
    const { view, viewDate } = get();
    get().setViewDate(view === "week" ? addDays(viewDate, 7) : addMonths(viewDate, 1));
  },
  goToday: () => get().setViewDate(new Date()),

  reload: async () => {
    const { view, viewDate } = get();
    const range = rangeFor(view, viewDate);
    set({ status: "loading", range });
    try {
      const occurrences = await service.listOccurrences(range[0], range[1]);
      set({ occurrences, status: "idle", error: null });
    } catch (e) {
      console.error("[calendar] load failed", e);
      set({ status: "error", error: String(e) });
    }
  },

  createEvent: async (input) => {
    const id = await service.createEvent(input);
    await get().reload();
    return id;
  },
  updateEvent: async (target, patch) => {
    await service.updateEvent(target, patch, false);
    await get().reload();
  },
  deleteEvent: async (target) => {
    await service.deleteEvent(target);
    await get().reload();
  },
}));
