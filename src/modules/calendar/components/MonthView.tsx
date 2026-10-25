import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  format,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  endOfMonth,
  endOfWeek,
  eachDayOfInterval,
} from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Home, Pencil, Plus, RefreshCw, Repeat2, Trash2 } from "lucide-react";
import { useCalendarStore } from "../../../stores/calendarStore";
import { DAY_MS } from "../../../lib/time";
import { categoryOf } from "../../../lib/colors";
import type { Occurrence } from "../service";
import { EventDialog, type DialogState } from "./EventDialog";
import { ContextMenu, type CtxMenuItem } from "../../../components/ui/ContextMenu";
import { cn } from "../../../lib/utils";

const MAX_CHIPS = 3;

interface ChipDrag {
  id: string;
  fromIdx: number;
  toIdx: number;
  moved: boolean;
  occ: Occurrence;
}

/** 月视图：完整月网格 + 事件块 + 点击编辑 + 拖拽换日 + 溢出 +N 弹层。 */
export function MonthView() {
  const viewDate = useCalendarStore((s) => s.viewDate);
  const occurrences = useCalendarStore((s) => s.occurrences);
  const status = useCalendarStore((s) => s.status);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const createEvent = useCalendarStore((s) => s.createEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const reload = useCalendarStore((s) => s.reload);
  const goToday = useCalendarStore((s) => s.goToday);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewDate]);
  const rows = days.length / 7;

  const [dialog, setDialog] = useState<DialogState>({ open: false, mode: "create" });
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    title: string;
    category: string;
  } | null>(null);
  const [toIdx, setToIdx] = useState<number | null>(null);
  const dragRef = useRef<ChipDrag | null>(null);
  const suppressClickRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // 每天的事件列表（全天事件跨多天显示；定时事件只显示在开始日）
  const byDay = useMemo(() => {
    const dayOf = (ms: number) =>
      days.findIndex((d) => startOfDay(d).getTime() === startOfDay(new Date(ms)).getTime());
    const buckets: Occurrence[][] = days.map(() => []);
    for (const occ of occurrences) {
      if (occ.allDay) {
        const s = dayOf(occ.startAt);
        const e = dayOf(occ.endAt - 1);
        if (s >= 0) {
          for (let i = s; i <= Math.min(days.length - 1, e === -1 ? s : e); i++) {
            buckets[i].push(occ);
          }
        }
      } else {
        const i = dayOf(occ.startAt);
        if (i >= 0) buckets[i].push(occ);
      }
    }
    return buckets;
  }, [occurrences, days]);

  /** 指针位置 → 网格单元索引。 */
  const cellIdxAt = (x: number, y: number): number | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const cellW = rect.width / 7;
    const cellH = rect.height / rows;
    const col = Math.floor((x - rect.left) / cellW);
    const row = Math.floor((y - rect.top) / cellH);
    if (col < 0 || col > 6 || row < 0 || row >= rows) return null;
    return row * 7 + col;
  };

  const startChipDrag = (e: ReactPointerEvent, occ: Occurrence, fromIdx: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const d: ChipDrag = { id: occ.id, fromIdx, toIdx: fromIdx, moved: false, occ };
    dragRef.current = d;
    setGhost({ x: e.clientX, y: e.clientY, title: occ.title, category: occ.category });
    setToIdx(fromIdx);
  };

  useEffect(() => {
    if (!ghost) return;
    const onMove = (e: PointerEvent) => {
      const idx = cellIdxAt(e.clientX, e.clientY);
      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      setToIdx(idx);
      if (dragRef.current) {
        dragRef.current.moved = true;
        if (idx !== null) dragRef.current.toIdx = idx;
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d && d.moved && d.toIdx !== d.fromIdx) {
        const shift = (d.toIdx - d.fromIdx) * DAY_MS;
        void updateEvent(
          { id: d.id, occurrenceStart: d.occ.originalStart ?? null },
          { startAt: d.occ.startAt + shift, endAt: d.occ.endAt + shift },
        );
      }
      if (d?.moved) suppressClickRef.current = true;
      dragRef.current = null;
      setGhost(null);
      setToIdx(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost !== null]);

  const openEdit = (occ: Occurrence) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setDialog({ open: true, mode: "edit", occ });
  };

  const onCellDoubleClick = (day: Date) => {
    const s = startOfDay(day).getTime() + 9 * 3_600_000;
    setDialog({ open: true, mode: "create", defaultStart: s, defaultEnd: s + 3_600_000 });
  };

  /** 空白格右键：按日期新建日程 + 刷新 + 回到今天。 */
  const openBlankMenu = (e: ReactMouseEvent, day: Date) => {
    e.preventDefault();
    const s = startOfDay(day).getTime() + 9 * 3_600_000;
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: `新建日程（${format(day, "M月d日")}）`,
          icon: <Plus className="size-3.5" />,
          onSelect: () => setDialog({ open: true, mode: "create", defaultStart: s, defaultEnd: s + 3_600_000 }),
        },
        {
          label: "刷新日程",
          icon: <RefreshCw className="size-3.5" />,
          onSelect: () => void reload(),
        },
        {
          label: "回到今天",
          icon: <Home className="size-3.5" />,
          onSelect: () => goToday(),
        },
      ],
    });
  };

  /** 事件块上右键：编辑 / 删除（两步确认）。 */
  const openEventMenu = (e: ReactMouseEvent, occ: Occurrence) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "编辑日程",
          icon: <Pencil className="size-3.5" />,
          onSelect: () => openEdit(occ),
        },
        {
          label: "删除日程",
          icon: <Trash2 className="size-3.5" />,
          danger: true,
          confirmLabel: "确认删除？",
          onSelect: () =>
            void deleteEvent({ id: occ.id, occurrenceStart: occ.originalStart ?? null }),
        },
      ],
    });
  };

  const cat = ghost ? categoryOf(ghost.category) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 星期头 */}
      <div className="grid shrink-0 grid-cols-7 border-b border-white/6">
        {["一", "二", "三", "四", "五", "六", "日"].map((w, i) => (
          <div
            key={w}
            className={cn(
              "py-2 text-center text-xs font-medium text-muted-foreground",
              i >= 5 && "text-muted-foreground/60",
            )}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 月网格 */}
      <div
        ref={gridRef}
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: `repeat(${rows}, 1fr)` }}
      >
        {days.map((day, idx) => {
          const inMonth = isSameMonth(day, viewDate);
          const today = isToday(day);
          const chips = byDay[idx];
          return (
            <div
              key={day.getTime()}
              onDoubleClick={() => onCellDoubleClick(day)}
              onContextMenu={(e) => openBlankMenu(e, day)}
              className={cn(
                "relative flex min-h-0 flex-col gap-0.5 overflow-hidden border-l border-t border-white/5 p-1",
                idx % 7 === 0 && "border-l-0",
                idx < 7 && "border-t-0",
                !inMonth && "bg-white/[0.015]",
                today && "bg-indigo-400/[0.05]",
                toIdx === idx && "ring-2 ring-inset ring-indigo-400/50",
              )}
            >
              <div className="flex items-center justify-end pr-1">
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    inMonth ? "text-foreground/85" : "text-muted-foreground/30",
                    today &&
                      "flex size-5 items-center justify-center rounded-full bg-indigo-500 text-white",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>
              {chips.slice(0, MAX_CHIPS).map((occ) => {
                const c = categoryOf(occ.category);
                return (
                  <button
                    key={occ.id}
                    onPointerDown={(e) => startChipDrag(e, occ, idx)}
                    onClick={() => openEdit(occ)}
                    onContextMenu={(e) => openEventMenu(e, occ)}
                    title={occ.title}
                    className="flex items-center gap-1 truncate rounded-md border border-white/10 px-1.5 py-0.5 text-left text-[10px] font-medium transition hover:brightness-125"
                    style={{
                      background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                      color: c.text,
                      borderLeft: `2px solid ${c.bar}`,
                    }}
                  >
                    {occ.rrule && <Repeat2 className="size-2.5 shrink-0 opacity-70" />}
                    <span className="truncate">{occ.title}</span>
                  </button>
                );
              })}
              {chips.length > MAX_CHIPS && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="px-1.5 py-0.5 text-left text-[10px] text-muted-foreground transition hover:text-foreground">
                      +{chips.length - MAX_CHIPS} 更多
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-1.5" align="start">
                    <div className="flex flex-col gap-1">
                      {chips.slice(MAX_CHIPS).map((occ) => {
                        const c = categoryOf(occ.category);
                        return (
                          <button
                            key={occ.id}
                            onClick={() => openEdit(occ)}
                            className="truncate rounded-md border border-white/10 px-2 py-1 text-left text-xs"
                            style={{
                              background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                              color: c.text,
                              borderLeft: `2px solid ${c.bar}`,
                            }}
                          >
                            {occ.title}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          );
        })}
      </div>

      {status === "error" && (
        <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs text-red-300">
          数据加载失败，请检查控制台
        </div>
      )}

      {/* 拖拽幽灵：Portal 到 body——.glass 的 backdrop-filter 会创建包含块，
          fixed 定位若留在面板内会相对面板偏移 */}
      {ghost &&
        cat &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/20 px-2 py-1 text-[10px] font-medium shadow-xl"
            style={{
              left: ghost.x,
              top: ghost.y,
              background: `linear-gradient(135deg, ${cat.from}, ${cat.to})`,
              color: cat.text,
              borderLeft: `3px solid ${cat.bar}`,
            }}
          >
            {ghost.title}
          </div>,
          document.body,
        )}

      <EventDialog
        state={dialog}
        onClose={() => setDialog((s) => ({ ...s, open: false }))}
        onCreate={async (input) => {
          await createEvent(input);
        }}
        onUpdate={updateEvent}
        onDelete={deleteEvent}
      />

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
