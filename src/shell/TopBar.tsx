import { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCalendarStore } from "../stores/calendarStore";
import { useUiStore } from "../stores/uiStore";
import { startOfWeek, weekDays } from "../lib/time";
import { cn } from "../lib/utils";
import { ContextMenu, type CtxMenuItem } from "../components/ui/ContextMenu";
import { CALENDAR_MODES, WORKBENCH } from "./workbench";

/**
 * 日历专用工具栏：**只在日历视图渲染**。
 *
 * 其它页面（求职中心 / 邮箱 / 知识库 / 待办）都有自己的页内标题栏，
 * 再顶一条只有标题的空条就是浪费高度 —— 全局动作已上移到 TitleBar。
 */
export function TopBar() {
  const appView = useUiStore((s) => s.appView);
  const view = useCalendarStore((s) => s.view);
  const viewDate = useCalendarStore((s) => s.viewDate);
  const setView = useCalendarStore((s) => s.setView);
  const goPrev = useCalendarStore((s) => s.goPrev);
  const goNext = useCalendarStore((s) => s.goNext);
  const goToday = useCalendarStore((s) => s.goToday);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);

  if (appView !== "calendar") return null;

  const label =
    view === "week"
      ? `${format(startOfWeek(viewDate), "M月d日")} – ${format(weekDays(viewDate)[6], "M月d日")}`
      : format(viewDate, "yyyy年M月");

  const quickSwitch = (e: ReactMouseEvent) => {
    e.preventDefault();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...CALENDAR_MODES.map((m) => ({
          label: m.id === "week" ? "周视图" : "月视图",
          onSelect: () => setView(m.id),
        })),
        ...WORKBENCH.map((w) => ({
          label: w.title,
          icon: <w.icon className="size-3.5" />,
          onSelect: () => useUiStore.getState().setAppView(w.id),
        })),
      ],
    });
  };

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-white/6 px-3 py-2">
      <div className="flex items-center gap-2" onContextMenu={quickSwitch}>
        <div className="glass-bar flex rounded-xl border p-0.5">
          {CALENDAR_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setView(m.id)}
              className={cn(
                "rounded-[10px] px-2.5 py-0.5 text-xs font-medium transition",
                view === m.id
                  ? "bg-white/10 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
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
        </div>

        <span className="ml-1 min-w-32 truncate text-sm font-semibold">{label}</span>
      </div>

      <div className="flex-1" />

      <button
        onClick={() => useUiStore.getState().openCreateDialog()}
        className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400"
      >
        <Plus className="size-3.5" />
        新建事件
      </button>

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </header>
  );
}
