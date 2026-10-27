import type { MouseEvent as ReactMouseEvent } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCalendarStore } from "../stores/calendarStore";
import { startOfWeek } from "../lib/time";
import { cn } from "../lib/utils";
import { useMonthEventDays } from "./hooks/useMonthEventDays";

/** 侧边栏小月历：只渲染 + 选日；事件圆点由 useMonthEventDays 提供。 */
export function MiniMonth({
  onDayContextMenu,
}: {
  onDayContextMenu?: (e: ReactMouseEvent, day: Date) => void;
}) {
  const viewDate = useCalendarStore((s) => s.viewDate);
  const setViewDate = useCalendarStore((s) => s.setViewDate);
  const today = new Date();
  const eventDays = useMonthEventDays(viewDate);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewDate)),
    end: endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 }),
  });

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
          <span key={w} className="py-0.5 text-ui-10 text-muted-foreground/70">
            {w}
          </span>
        ))}
        {days.map((d) => (
          <button
            key={d.getTime()}
            onClick={() => setViewDate(d)}
            onContextMenu={(e) => onDayContextMenu?.(e, d)}
            className={cn(
              "relative flex flex-col items-center rounded-md py-1 text-ui-11 transition hover:bg-white/8",
              !isSameMonth(d, viewDate) && "text-muted-foreground/30",
              isSameDay(d, viewDate) &&
                "bg-indigo-500/25 font-semibold text-indigo-200 ring-1 ring-indigo-400/40",
              isSameDay(d, today) && !isSameDay(d, viewDate) && "text-indigo-300",
            )}
          >
            {format(d, "d")}
            {eventDays.has(startOfDay(d).getTime()) && (
              <span className="absolute bottom-0.5 size-1 rounded-full bg-indigo-400" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
