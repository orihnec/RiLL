import { useEffect } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
} from "date-fns";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Command as CommandIcon,
  Library,
  Loader2,
  Sparkles,
} from "lucide-react";
import { modules } from "../modules";
import { toolRegistry } from "../kernel/agent/registry";
import { commands } from "../kernel/commands";
import { ragSources } from "../kernel/rag/sources";
import { useCalendarStore } from "../stores/calendarStore";
import { CATEGORIES } from "../lib/colors";
import { startOfWeek, weekDays } from "../lib/time";
import { cn } from "../lib/utils";

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
  const gridStart = startOfWeek(startOfMonth(viewDate));
  const gridEnd = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="glass rounded-2xl p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold">{format(viewDate, "yyyy年M月")}</span>
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
              "rounded-md py-1 text-[11px] transition hover:bg-white/8",
              !isSameMonth(d, viewDate) && "text-muted-foreground/30",
              isSameDay(d, viewDate) &&
                "bg-indigo-500/25 font-semibold text-indigo-200 ring-1 ring-indigo-400/40",
              isSameDay(d, today) && !isSameDay(d, viewDate) && "text-indigo-300",
            )}
          >
            {format(d, "d")}
          </button>
        ))}
      </div>
    </div>
  );
}

function Sidebar() {
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
    </aside>
  );
}

/* ---------------- Main ---------------- */

function BootStatus() {
  const { status, error } = useCalendarStore();
  return (
    <div className="glass rounded-3xl p-6">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {status === "error" ? (
          <span className="text-red-400">数据层异常</span>
        ) : (
          <>
            <CheckCircle2 className="size-4 text-emerald-400" />
            内核与模块已启动
          </>
        )}
      </div>
      {status === "error" && (
        <p className="mb-3 font-mono text-xs text-red-400">{error}</p>
      )}
      <ul className="space-y-2">
        {modules.map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-xs text-foreground/80">
            <span className="rounded-md bg-white/6 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
              {m.id}
            </span>
            {m.name}
            <span className="ml-auto text-[10px] text-muted-foreground/60">
              迁移 {m.migrations?.length ?? 0} · 工具{" "}
              {Object.keys(m.tools ?? {}).length} · 命令 {m.commands?.length ?? 0} · RAG{" "}
              {m.ragSources?.length ?? 0}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-white/6 pt-3 text-[11px] text-muted-foreground/70">
        注册表合计：{toolRegistry.getAll().length} 工具 · {commands.getAll().length} 命令 ·{" "}
        {ragSources.getAll().length} RAG 源
      </p>
    </div>
  );
}

function WeekPlaceholder() {
  const { status } = useCalendarStore();
  return (
    <div className="glass flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl p-8 text-center">
      {status === "loading" ? (
        <Loader2 className="size-6 animate-spin text-indigo-300" />
      ) : (
        <>
          <CalendarDays className="size-8 text-indigo-300/70" />
          <div className="text-sm font-medium">周视图建设中（M1 · C2）</div>
          <div className="max-w-md text-xs leading-relaxed text-muted-foreground/70">
            时间网格 + 当前时间线 + 事件 CRUD + 拖拽改时间 + resize 改时长。
            <br />
            数据层（SQLite + 迁移）已就绪，下一步在本区域渲染真实日程。
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const reload = useCalendarStore((s) => s.reload);
  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 24 }}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0"
        >
          <BootStatus />
          <WeekPlaceholder />
        </motion.main>
      </div>
    </div>
  );
}
