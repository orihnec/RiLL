import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { format, isToday, startOfDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Home, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCalendarStore } from "../../../stores/calendarStore";
import { DAY_MS, weekDays } from "../../../lib/time";
import { categoryOf } from "../../../lib/colors";
import type { Occurrence } from "../service";
import { EventCard } from "./EventCard";
import { EventDialog, type DialogState } from "./EventDialog";
import { ContextMenu, type CtxMenuItem } from "../../../components/ui/ContextMenu";
import { cn } from "../../../lib/utils";

export const HOUR_H = 56; // 每小时像素高度
const SNAP_MS = 15 * 60_000; // 15 分钟吸附
const MIN_DUR = 15 * 60_000;
const HOUR_MS = 3_600_000;
const GUTTER_W = 48; // 时间刻度栏宽度

interface DragState {
  id: string;
  occ: Occurrence;
  mode: "move" | "resize";
  grabOffsetMs: number;
  origStart: number;
  origEnd: number;
  curStart: number;
  curEnd: number;
  moved: boolean;
}

interface Placed {
  occ: Occurrence;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/** 重叠事件列布局（区间图着色：同簇内分 lane，宽 = 1/lanes）。 */
function placeEvents(events: Occurrence[], dayStartMs: number): Placed[] {
  const sorted = [...events].sort(
    (a, b) => a.startAt - b.startAt || b.endAt - a.endAt,
  );
  const groups: Occurrence[][] = [];
  for (const occ of sorted) {
    const g = groups.find((grp) =>
      grp.some((o) => o.startAt < occ.endAt && o.endAt > occ.startAt),
    );
    if (g) g.push(occ);
    else groups.push([occ]);
  }
  const out: Placed[] = [];
  for (const grp of groups) {
    const laneEnds: number[] = [];
    for (const occ of grp) {
      const lane = laneEnds.findIndex((end) => end <= occ.startAt);
      const idx = lane === -1 ? laneEnds.length : lane;
      if (lane === -1) laneEnds.push(occ.endAt);
      else laneEnds[lane] = occ.endAt;
      out.push({
        occ,
        top: ((occ.startAt - dayStartMs) / HOUR_MS) * HOUR_H,
        height: Math.max(((occ.endAt - occ.startAt) / HOUR_MS) * HOUR_H, 16),
        lane: idx,
        lanes: laneEnds.length,
      });
    }
  }
  return out;
}

/** 周视图：时间网格 + 当前时间线 + 事件 CRUD + 拖拽改时间 + resize 改时长。 */
export function WeekView() {
  const viewDate = useCalendarStore((s) => s.viewDate);
  const occurrences = useCalendarStore((s) => s.occurrences);
  const status = useCalendarStore((s) => s.status);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const createEvent = useCalendarStore((s) => s.createEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const reload = useCalendarStore((s) => s.reload);
  const goToday = useCalendarStore((s) => s.goToday);

  const days = useMemo(() => weekDays(viewDate), [viewDate]);
  const dayMs = useMemo(() => days.map((d) => startOfDay(d).getTime()), [days]);
  const dayMsRef = useRef(dayMs);
  dayMsRef.current = dayMs;

  const [now, setNow] = useState(() => new Date());
  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    mode: "create",
  });
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 当前时间：10s 轮询 + 窗口聚焦/可见性变化时立即刷新
  // （WebView2 对后台窗口定时器会节流，切回前台必须强制刷新）
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const t = setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // 初始滚动到 7:00
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 7 * HOUR_H;
  }, []);

  // 按天分桶
  const byDay = useMemo(() => {
    const buckets: Occurrence[][] = days.map(() => []);
    const allDay: Occurrence[][] = days.map(() => []);
    for (const occ of occurrences) {
      if (occ.allDay) {
        const idx = dayMs.findIndex((s) => occ.startAt >= s && occ.startAt < s + DAY_MS);
        if (idx >= 0) allDay[idx].push(occ);
      } else {
        const idx = dayMs.findIndex(
          (s) => occ.startAt < s + DAY_MS && occ.endAt > s,
        );
        if (idx >= 0) buckets[idx].push(occ);
      }
    }
    return { buckets, allDay };
  }, [occurrences, days, dayMs]);

  const todayIdx = days.findIndex((d) => isToday(d));
  const nowVisible =
    todayIdx >= 0 &&
    now.getTime() >= dayMs[todayIdx] &&
    now.getTime() < dayMs[todayIdx] + DAY_MS;
  const nowTop = ((now.getTime() - dayMs[todayIdx]) / HOUR_MS) * HOUR_H;
  const isEmpty =
    byDay.buckets.every((b) => b.length === 0) && byDay.allDay.every((b) => b.length === 0);

  /** 指针位置 → 日列索引 + 本地时间（ms），钳制在当天范围内。 */
  const timeAt = (clientX: number, clientY: number): { dayIdx: number; ms: number } => {
    const grid = gridRef.current;
    if (!grid) return { dayIdx: 0, ms: 0 };
    const rect = grid.getBoundingClientRect();
    const dayW = rect.width / 7;
    const dayIdx = Math.min(
      6,
      Math.max(0, Math.floor((clientX - rect.left) / dayW)),
    );
    const y = clientY - rect.top;
    const ms = dayMsRef.current[dayIdx] + (y / HOUR_H) * HOUR_MS;
    const dayStart = dayMsRef.current[dayIdx];
    return { dayIdx, ms: Math.min(dayStart + DAY_MS, Math.max(dayStart, ms)) };
  };

  const startMove = (e: ReactPointerEvent, occ: Occurrence) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const { ms } = timeAt(e.clientX, e.clientY);
    const d: DragState = {
      id: occ.id,
      occ,
      mode: "move",
      grabOffsetMs: occ.startAt - ms,
      origStart: occ.startAt,
      origEnd: occ.endAt,
      curStart: occ.startAt,
      curEnd: occ.endAt,
      moved: false,
    };
    dragRef.current = d;
    setDrag(d);
  };

  const startResize = (e: ReactPointerEvent, occ: Occurrence) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const d: DragState = {
      id: occ.id,
      occ,
      mode: "resize",
      grabOffsetMs: 0,
      origStart: occ.startAt,
      origEnd: occ.endAt,
      curStart: occ.startAt,
      curEnd: occ.endAt,
      moved: false,
    };
    dragRef.current = d;
    setDrag(d);
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const { ms } = timeAt(e.clientX, e.clientY);
      setDrag((d) => {
        if (!d) return d;
        const next: DragState = { ...d, moved: true };
        if (d.mode === "move") {
          const start = Math.round((ms + d.grabOffsetMs) / SNAP_MS) * SNAP_MS;
          const dur = d.origEnd - d.origStart;
          next.curStart = start;
          next.curEnd = start + dur;
        } else {
          next.curEnd = Math.max(d.origStart + MIN_DUR, Math.round(ms / SNAP_MS) * SNAP_MS);
        }
        dragRef.current = next;
        return next;
      });
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d && d.moved && (d.curStart !== d.origStart || d.curEnd !== d.origEnd)) {
        void updateEvent(
          { id: d.id, occurrenceStart: d.occ.originalStart ?? null },
          { startAt: d.curStart, endAt: d.curEnd },
        );
      }
      suppressClickRef.current = !!d?.moved;
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.mode, drag?.id]);

  const onDoubleClick = (e: ReactMouseEvent) => {
    const { ms } = timeAt(e.clientX, e.clientY);
    const start = Math.round(ms / SNAP_MS) * SNAP_MS;
    setDialog({
      open: true,
      mode: "create",
      defaultStart: start,
      defaultEnd: start + 3_600_000,
    });
  };

  const openEdit = (occ: Occurrence) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setDialog({ open: true, mode: "edit", occ });
  };

  /** 空白处右键：按点击位置新建日程 + 刷新 + 回到今天。 */
  const openBlankMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    const { ms } = timeAt(e.clientX, e.clientY);
    const start = Math.round(ms / SNAP_MS) * SNAP_MS;
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: `新建日程（${format(new Date(start), "M月d日 HH:mm")}）`,
          icon: <Plus className="size-3.5" />,
          onSelect: () =>
            setDialog({ open: true, mode: "create", defaultStart: start, defaultEnd: start + 3_600_000 }),
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

  /** 事件上右键：编辑 / 删除（两步确认）。 */
  const openEventMenu = (e: ReactMouseEvent, occ: Occurrence) => {
    e.preventDefault();
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 星期头 */}
      <div
        className="grid shrink-0"
        style={{ gridTemplateColumns: `${GUTTER_W}px repeat(7, 1fr)` }}
      >
        <div />
        {days.map((d, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col items-center gap-0.5 border-b border-white/6 py-2",
              i === todayIdx && "text-indigo-300",
            )}
          >
            <span className="text-[10px] text-muted-foreground">
              {format(d, "EEE", { locale: zhCN })}
            </span>
            <span
              className={cn(
                "text-sm font-semibold",
                i === todayIdx &&
                  "flex size-6 items-center justify-center rounded-full bg-indigo-500 text-white",
              )}
            >
              {format(d, "d")}
            </span>
          </div>
        ))}
      </div>

      {/* 全天条：**没有全天事件就不占位**（否则星期头下面会多出一条空白） */}
      {byDay.allDay.some((evts) => evts.length > 0) && (
        <div
          className="grid shrink-0 border-b border-white/6"
          style={{ gridTemplateColumns: `${GUTTER_W}px repeat(7, 1fr)` }}
        >
          <div />
          {byDay.allDay.map((evts, i) => (
            <div key={i} className="flex min-h-7 flex-col gap-1 px-1 py-1">
              {evts.map((occ) => (
                <button
                  key={occ.id}
                  onClick={() => openEdit(occ)}
                  onContextMenu={(e) => openEventMenu(e, occ)}
                  className="truncate rounded-md border border-white/10 px-1.5 py-0.5 text-left text-[10px] font-medium"
                  style={{
                    background: `linear-gradient(135deg, ${categoryOf(occ.category).from}, ${categoryOf(occ.category).to})`,
                    color: categoryOf(occ.category).text,
                  }}
                  title={occ.title}
                >
                  {occ.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 时间网格（可滚动） */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div ref={gridRef} className="relative" style={{ height: 24 * HOUR_H }}>
          {/* 小时刻度 + 横线 */}
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute inset-x-0" style={{ top: h * HOUR_H, height: HOUR_H }}>
              <div className="absolute -top-2 left-0 w-11 pr-2 text-right text-[10px] tabular-nums text-muted-foreground/60">
                {`${String(h).padStart(2, "0")}:00`}
              </div>
              <div className="absolute left-12 right-0 top-0 border-t border-white/5" />
            </div>
          ))}

          {/* 日列区域 */}
          <div className="absolute bottom-0 top-0" style={{ left: GUTTER_W, right: 0 }}>
            {/* 列背景 */}
            <div
              className="absolute inset-0 grid"
              style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
            >
              {days.map((_, i) => (
                <div
                  key={i}
                  onDoubleClick={(e) => onDoubleClick(e)}
                  onContextMenu={(e) => openBlankMenu(e)}
                  className={cn(
                    "relative border-l border-white/5",
                    i === todayIdx && "bg-indigo-400/[0.05]",
                    (i === 5 || i === 6) && "bg-white/[0.02]",
                  )}
                />
              ))}
            </div>

            {/* 事件层（pointer-events-none：空白区域点击穿透到列的双击新建） */}
            {days.map((_, i) => (
              <div
                key={i}
                className="pointer-events-none absolute bottom-0 top-0"
                style={{ left: `${(i / 7) * 100}%`, width: `${100 / 7}%` }}
              >
                {placeEvents(byDay.buckets[i], dayMs[i])
                  .filter((p) => !drag || p.occ.id !== drag.id)
                  .map((p) => {
                    const occ = p.occ;
                    return (
                      <div
                        key={occ.id}
                        className="pointer-events-auto absolute px-0.5"
                        style={{
                          top: ((occ.startAt - dayMs[i]) / HOUR_MS) * HOUR_H,
                          height: Math.max(((occ.endAt - occ.startAt) / HOUR_MS) * HOUR_H, 18),
                          left: `${(p.lane / p.lanes) * 100}%`,
                          width: `calc(${100 / p.lanes}% - 4px)`,
                        }}
                      >
                        <EventCard
                          occ={occ}
                          onClick={() => openEdit(occ)}
                          onPointerDown={(e) => startMove(e, occ)}
                          onResizeStart={(e) => startResize(e, occ)}
                          onContextMenu={(e) => openEventMenu(e, occ)}
                        />
                      </div>
                    );
                  })}
              </div>
            ))}

            {/* 拖拽幽灵：渲染在 curStart 所在列，卡片跟随指针跨天 */}
            {drag &&
              (() => {
                const d = drag;
                const dayIdx = dayMs.findIndex(
                  (s) => d.curStart >= s && d.curStart < s + DAY_MS,
                );
                if (dayIdx < 0) return null;
                return (
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 z-20"
                    style={{ left: `${(dayIdx / 7) * 100}%`, width: `${100 / 7}%` }}
                  >
                    <div
                      className="absolute px-0.5"
                      style={{
                        top: ((d.curStart - dayMs[dayIdx]) / HOUR_MS) * HOUR_H,
                        height: Math.max(((d.curEnd - d.curStart) / HOUR_MS) * HOUR_H, 18),
                        left: 0,
                        right: 0,
                      }}
                    >
                      <EventCard
                        occ={{ ...d.occ, startAt: d.curStart, endAt: d.curEnd }}
                        draft
                        onClick={() => {}}
                        onPointerDown={() => {}}
                        onResizeStart={() => {}}
                      />
                    </div>
                  </div>
                );
              })()}

            {/* 当前时间线：位置 = (now - 当天零点) / 小时毫秒 × HOUR_H，与刻度同坐标系 */}
            {nowVisible && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10"
                style={{ top: nowTop }}
              >
                <div className="relative h-px bg-rose-400/80">
                  <span className="absolute -left-1 -top-[3px] size-1.5 rounded-full bg-rose-400" />
                  <span className="absolute left-2 -top-[26px] rounded-md bg-rose-500/90 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white shadow-md">
                    {format(now, "HH:mm")}
                  </span>
                </div>
              </div>
            )}

            {/* 空状态 */}
            {isEmpty && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div className="rounded-2xl border border-white/8 bg-popover/85 px-4 py-2 text-xs text-muted-foreground/80 backdrop-blur">
                  本周暂无日程 — 双击空白处创建（或按 Ctrl+N）
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {status === "error" && (
        <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs text-red-300">
          数据加载失败，请检查控制台
        </div>
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
