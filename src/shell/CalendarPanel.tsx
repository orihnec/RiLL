import { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { format, startOfDay } from "date-fns";
import { AlarmClock, Home, Plus, Tags } from "lucide-react";
import { useCalendarStore } from "../stores/calendarStore";
import { useCategoryStore } from "../stores/categoryStore";
import { useUiStore } from "../stores/uiStore";
import { ContextMenu, type CtxMenuItem } from "../components/ui/ContextMenu";
import { MiniMonth } from "./MiniMonth";

/**
 * 日历专属面板：只在日历视图出现，把宽度让给其它工作台。
 * 内容：小月历（选日期）+ 类别速览 + 习惯入口。
 */
export function CalendarPanel() {
  const categories = useCategoryStore((s) => s.categories);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);

  /** 小月历某天右键：快速新建该日日程 / 回到今天。 */
  const dayMenu = (e: ReactMouseEvent, day: Date) => {
    e.preventDefault();
    const start = startOfDay(day).getTime() + 9 * 3_600_000;
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: `新建日程（${format(day, "M月d日")}）`,
          icon: <Plus className="size-3.5" />,
          onSelect: () => useUiStore.getState().openCreateDialog(start, start + 3_600_000),
        },
        {
          label: "回到今天",
          icon: <Home className="size-3.5" />,
          onSelect: () => useCalendarStore.getState().goToday(),
        },
      ],
    });
  };

  const line = "flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground/70 transition hover:text-foreground";

  return (
    <aside className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/6 p-3">
      <MiniMonth onDayContextMenu={dayMenu} />

      <button
        onClick={() => useUiStore.getState().setHabitsOpen(true)}
        title="习惯：每天 / 每周固定的安排，保存后直接出现在日历里"
        className={line}
      >
        <AlarmClock className="size-3" />
        习惯
        <span className="ml-auto opacity-60">每天固定日程</span>
      </button>

      <button
        onClick={() => useUiStore.getState().setCategoryManagerOpen(true)}
        title="类别管理（重命名 / 排序 / 自选颜色）"
        className={line}
      >
        <Tags className="size-3" />
        类别
        <span className="ml-auto max-w-24 truncate opacity-60">
          {categories.map((c) => c.name).join(" · ")}
        </span>
      </button>

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </aside>
  );
}
