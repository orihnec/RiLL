import { useEffect, useState } from "react";
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  startOfDay,
} from "date-fns";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Command as CommandIcon,
  Library,
  Settings,
  Sparkles,
} from "lucide-react";
import { useCalendarStore } from "../stores/calendarStore";
import { CATEGORIES } from "../lib/colors";
import { DAY_MS, startOfWeek, weekDays } from "../lib/time";
import { cn } from "../lib/utils";
import { WeekView } from "../modules/calendar/components/WeekView";
import { MonthView } from "../modules/calendar/components/MonthView";
import { EventDialog, type DialogState } from "../modules/calendar/components/EventDialog";
import { SettingsDialog } from "./SettingsDialog";
import * as calendarService from "../modules/calendar/service";

/* ---------------- TopBar ---------------- */

function TopBar() {
  const { view, viewDate, setView, goPrev, goNext, goToday } = useCalendarStore();
  const weekStart = startOfWeek(viewDate);
  const label =
    view === "week"
      ? `${format(weekStart, "M月d日")} – ${format(weekDays(viewDate)[6], "M月d日")}`
      : format(viewDate, "yyyy年M月");

  return (
    <header className="flex items-center gap-3 px-6 py-3">
      <div className="flex items-center gap-2 pr-2">
        <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/60 to-sky-500/40 shadow-lg shadow-indigo-950/40">
          <CalendarDays className="size-4.5 text-white" />
        </div>
        <span className="text-sm font-semibold tracking-wide">RiliAgent</span>
        <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
          <Sparkles className="mr-0.5 inline size-2.5" /> AI
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={goPrev}
          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
          aria-label="上一页"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          onClick={goToday}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
        >
          今天
        </button>
        <button
          onClick={goNext}
          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
          aria-label="下一页"
        >
          <ChevronRight className="size-4" />
        </button>
        <span className="ml-2 min-w-36 text-sm font-semibold">{label}</span>
      </div>

      <div className="flex-1" />

      <div className="flex rounded-xl border border-white/8 bg-white/4 p-0.5">
        {(["week", "month"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "rounded-[10px] px-3 py-1 text-xs font-medium transition",
              view === v
                ? "bg-white/10 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v === "week" ? "周" : "月"}
          </button>
        ))}
      </div>

      <button
        disabled
        title="Cmd+K 命令栏（M2）"
        className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3 py-1.5 text-xs text-muted-foreground"
      >
        <CommandIcon className="size-3.5" />
        <span>Cmd+K</span>
        <span className="text-[10px] text-muted-foreground/60">M2</span>
      </button>
    </header>
  );
}

/* ---------------- Sidebar ---------------- */

function MiniMonth() {
  const { viewDate, setViewDate } = useCalendarStore();
  const today = new Date();
  const [eventDays, setEventDays] = useState<number[]>([]);
  const gridStart = startOfWeek(startOfMonth(viewDate));
  const gridEnd = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // 加载当月事件 → 有事件的日子显示圆点
  useEffect(() => {
    const start = startOfMonth(viewDate).getTime();
    const end = endOfMonth(viewDate).getTime();
    let cancelled = false;
    void calendarService
      .listOccurrences(start, end + DAY_MS)
      .then((occs) => {
        if (cancelled) return;
        const set = new Set<number>();
        for (const o of occs) set.add(startOfDay(o.startAt).getTime());
        setEventDays([...set]);
      })
      .catch(() => !cancelled && setEventDays([]));
    return () => {
      cancelled = true;
    };
  }, [viewDate]);

  const eventSet = new Set(eventDays);

  return (
    <div className="glass rounded-2xl p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          onClick={() => setViewDate(addMonths(viewDate, -1))}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
          aria-label="上一月"
        >
          <ChevronLeft className="size-3" />
        </button>
        <span className="text-xs font-semibold">{format(viewDate, "yyyy年M月")}</span>
        <button
          onClick={() => setViewDate(addMonths(viewDate, 1))}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
          aria-label="下一月"
        >
          <ChevronRight className="size-3" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
          <span key={w} className="py-0.5 text-[10px] text-muted-foreground/70">
            {w}
          </span>
        ))}
        {days.map((d) => (
          <button
            key={d.getTime()}
            onClick={() => setViewDate(d)}
            className={cn(
              "relative flex flex-col items-center rounded-md py-1 text-[11px] transition hover:bg-white/8",
              !isSameMonth(d, viewDate) && "text-muted-foreground/30",
              isSameDay(d, viewDate) &&
                "bg-indigo-500/25 font-semibold text-indigo-200 ring-1 ring-indigo-400/40",
              isSameDay(d, today) && !isSameDay(d, viewDate) && "text-indigo-300",
            )}
          >
            {format(d, "d")}
            {eventSet.has(startOfDay(d).getTime()) && (
              <span className="absolute bottom-0.5 size-1 rounded-full bg-indigo-400" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/6 p-4">
      <MiniMonth />
      <div className="glass rounded-2xl p-3">
        <div className="mb-2 px-1 text-xs font-semibold text-muted-foreground">类别</div>
        <div className="flex flex-col gap-1.5">
          {CATEGORIES.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-foreground/80"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ background: c.bar, boxShadow: `0 0 8px ${c.bar}66` }}
              />
              {c.name}
            </div>
          ))}
        </div>
      </div>
      <button
        disabled
        title="知识库（M3）"
        className="glass flex items-center gap-2 rounded-2xl p-3 text-left text-xs text-muted-foreground"
      >
        <Library className="size-4" />
        知识库
        <span className="ml-auto text-[10px] text-muted-foreground/50">M3</span>
      </button>
      <button
        onClick={onOpenSettings}
        className="glass flex items-center gap-2 rounded-2xl p-3 text-left text-xs text-muted-foreground transition hover:text-foreground"
      >
        <Settings className="size-4" />
        设置
      </button>
    </aside>
  );
}

/* ---------------- Main ---------------- */

export default function App() {
  const reload = useCalendarStore((s) => s.reload);
  const view = useCalendarStore((s) => s.view);
  const setView = useCalendarStore((s) => s.setView);
  const goToday = useCalendarStore((s) => s.goToday);
  const createEvent = useCalendarStore((s) => s.createEvent);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createDialog, setCreateDialog] = useState<DialogState>({
    open: false,
    mode: "create",
  });

  useEffect(() => {
    void reload();
  }, [reload]);

  // 应用内快捷键：Ctrl+N 新建 / Ctrl+1·2 视图 / Ctrl+T 今天 / Ctrl+, 设置
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = navigator.userAgent.includes("Mac") ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      switch (e.key.toLowerCase()) {
        case "n":
          e.preventDefault();
          {
            const start = Math.ceil(Date.now() / 1_800_000) * 1_800_000;
            setCreateDialog({
              open: true,
              mode: "create",
              defaultStart: start,
              defaultEnd: start + 3_600_000,
            });
          }
          break;
        case "1":
          e.preventDefault();
          setView("week");
          break;
        case "2":
          e.preventDefault();
          setView("month");
          break;
        case "t":
          e.preventDefault();
          goToday();
          break;
        case ",":
          e.preventDefault();
          setSettingsOpen(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView, goToday]);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 24 }}
          className="flex min-h-0 flex-1 flex-col gap-4 p-4 pt-0"
        >
          {view === "week" ? <WeekView /> : <MonthView />}
        </motion.main>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <EventDialog
        state={createDialog}
        onClose={() => setCreateDialog((s) => ({ ...s, open: false }))}
        onCreate={async (input) => {
          await createEvent(input);
        }}
      />
    </div>
  );
}
