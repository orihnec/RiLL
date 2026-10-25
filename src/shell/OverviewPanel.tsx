import { useCallback, useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { format, startOfDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  CheckSquare,
  Copy,
  ExternalLink,
  Pin,
  PinOff,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import * as calendarService from "../modules/calendar/service";
import { listTodayTodos, toggleTodo, deleteTodo, type Todo } from "../modules/todo/service";
import { categoryOf } from "../lib/colors";
import { DAY_MS } from "../lib/time";
import { cn } from "../lib/utils";
import { useThemeStore } from "../stores/themeStore";
import { ContextMenu, type CtxMenuItem } from "../components/ui/ContextMenu";

/**
 * 今日日程悬浮窗（独立置顶小窗，view=overview 路由进入）。
 * - 透明窗口 + 100% 实底圆角面板：圆角外直接透出桌面（无方角底板、无阴影残留圈）
 * - 可拖动（顶部 data-tauri-drag-region）、可调大小（resizable）
 */
export function OverviewPanel() {
  const [now, setNow] = useState(() => new Date());
  const [occs, setOccs] = useState<calendarService.Occurrence[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [pinned, setPinned] = useState(true);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);
  const win = getCurrentWindow();

  const refresh = useCallback(() => {
    const d = new Date();
    setNow(d);
    const dayStart = startOfDay(d).getTime();
    void calendarService
      .listOccurrences(dayStart, dayStart + DAY_MS)
      .then(setOccs)
      .catch(() => setOccs([]));
    void listTodayTodos(dayStart, dayStart + DAY_MS)
      .then(setTodos)
      .catch(() => setTodos([]));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  // 悬浮窗是独立 webview：主窗口改了主题后，聚焦本窗口时重新读一次主题保持配色一致
  useEffect(() => {
    const onFocus = () => void useThemeStore.getState().load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // 恢复置顶记忆
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("rili:overview") ?? "{}") as {
        pinned?: boolean;
      };
      if (typeof saved.pinned === "boolean") {
        setPinned(saved.pinned);
        void win.setAlwaysOnTop(saved.pinned);
      }
    } catch {
      // 忽略损坏的状态
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPinnedState = (v: boolean) => {
    setPinned(v);
    void win.setAlwaysOnTop(v);
    try {
      localStorage.setItem("rili:overview", JSON.stringify({ pinned: v }));
    } catch {
      // ignore
    }
  };

  /** 复制文本到剪贴板（含 execCommand 兜底，兼容 WebView2）。 */
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  /** 打开主窗口（悬浮窗操作常用）。 */
  const showMain = async () => {
    const main = await WebviewWindow.getByLabel("main");
    if (main) {
      await main.show();
      await main.unminimize();
      await main.setFocus();
    }
  };

  /** 待办右键：标记完成/恢复 / 删除。 */
  const todoMenu = (e: ReactMouseEvent, t: Todo) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: t.done ? "恢复未完成" : "标记完成",
          icon: t.done ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />,
          onSelect: () => void toggleTodo(t.id).then(refresh),
        },
        {
          label: "删除",
          icon: <Trash2 className="size-3.5" />,
          danger: true,
          confirmLabel: "确认删除？",
          onSelect: () => void deleteTodo(t.id).then(refresh),
        },
      ],
    });
  };

  /** 日程右键：复制标题与时间。 */
  const eventMenu = (e: ReactMouseEvent, o: calendarService.Occurrence) => {
    e.preventDefault();
    e.stopPropagation();
    const txt = `${o.title}　${
      o.allDay ? "全天" : `${format(new Date(o.startAt), "HH:mm")}–${format(new Date(o.endAt), "HH:mm")}`
    }`;
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "复制日程",
          icon: <Copy className="size-3.5" />,
          onSelect: () => void copyText(txt),
        },
      ],
    });
  };

  /** 空白右键：刷新 / 打开主窗口。 */
  const blankMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "刷新", icon: <RefreshCw className="size-3.5" />, onSelect: () => refresh() },
        { label: "打开主窗口", icon: <ExternalLink className="size-3.5" />, onSelect: () => void showMain() },
      ],
    });
  };

  const today = format(now, "M月d日 EEEE", { locale: zhCN });
  const sorted = [...occs].sort((a, b) => a.startAt - b.startAt);
  const ts = now.getTime();
  const remaining = sorted.filter((o) => o.endAt > ts);

  return (
    // 不透明单层窗口：内容直接铺在深色底板上，无卡片描边/圆角，干净无瑕疵
    <div className="flex h-full min-h-0 flex-col">
        {/* 头部：日期（拖动区）+ 置顶开关 + 关闭 */}
        <div data-tauri-drag-region className="flex shrink-0 items-center gap-1.5 border-b border-white/6 px-3 py-2 select-none">
          <CalendarDays className="pointer-events-none size-3.5 text-indigo-300" />
          <span className="pointer-events-none truncate text-xs font-semibold">{today}</span>
          <span className="pointer-events-none text-[10px] text-muted-foreground/50">
            {sorted.length} 日程 · {todos.length} 待办
          </span>
        <div className="pointer-events-auto ml-auto flex items-center gap-0.5">
          <button
            onClick={() => setPinnedState(!pinned)}
            title={pinned ? "取消置顶（普通窗口层级）" : "置于顶层"}
            className={cn(
              "rounded-lg p-1 transition",
              pinned ? "bg-indigo-400/15 text-indigo-300" : "text-muted-foreground hover:bg-white/8 hover:text-foreground",
            )}
          >
            {pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
          </button>
          <button
            onClick={() => void win.hide()}
            title="隐藏悬浮窗（托盘可重新打开）"
            className="rounded-lg p-1 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5" onContextMenu={blankMenu}>
        {/* 今日待办 */}
        {todos.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            <div className="flex items-center gap-1 px-1 text-[10px] font-semibold text-muted-foreground/60">
              <CheckSquare className="size-3" /> 今日待办
            </div>
            {todos.slice(0, 5).map((t) => (
              <button
                key={t.id}
                onClick={() => void toggleTodo(t.id).then(refresh)}
                onContextMenu={(e) => todoMenu(e, t)}
                className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/3 px-2 py-1 text-left transition hover:bg-white/6"
              >
                <span className="size-3 shrink-0 rounded border border-white/25" />
                <span className="truncate text-[11px] text-foreground/85">{t.title}</span>
                {t.eventTitle && (
                  <span className="ml-auto shrink-0 truncate text-[9px] text-indigo-300/80">{t.eventTitle}</span>
                )}
              </button>
            ))}
            {todos.length > 5 && <p className="px-1 text-[9px] text-muted-foreground/40">还有 {todos.length - 5} 条…</p>}
          </div>
        )}

        {/* 日程列表 */}
        {sorted.length === 0 && todos.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-1.5 text-center text-[11px] text-muted-foreground/60">
            <CalendarDays className="size-5 opacity-50" />
            今天没有日程和待办
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 px-1 text-[10px] font-semibold text-muted-foreground/60">
              <CalendarDays className="size-3" /> 今日日程
            </div>
            {sorted.map((o) => {
              const cat = categoryOf(o.category);
              const ongoing = ts >= o.startAt && ts < o.endAt;
              const soon = !ongoing && o.startAt > ts && o.startAt - ts <= 30 * 60_000;
              return (
                <div
                  key={`${o.id}-${o.originalStart ?? o.startAt}`}
                  onContextMenu={(e) => eventMenu(e, o)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-2.5 py-1.5",
                    ongoing ? "border-indigo-400/40 bg-indigo-400/10" : "border-white/6 bg-white/3",
                  )}
                >
                  <span className="w-1 shrink-0 self-stretch rounded-full" style={{ background: cat.bar }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("truncate text-xs font-medium", ongoing && "text-indigo-100")}>{o.title}</span>
                      {ongoing && (
                        <span className="shrink-0 rounded-full bg-indigo-400/20 px-1.5 py-px text-[9px] text-indigo-200">进行中</span>
                      )}
                      {soon && (
                        <span className="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-px text-[9px] text-amber-300">即将开始</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground/60">
                      {o.allDay ? "全天" : `${format(new Date(o.startAt), "HH:mm")} – ${format(new Date(o.endAt), "HH:mm")}`}
                    </div>
                  </div>
                </div>
              );
            })}
            {remaining.length === 0 && sorted.length > 0 && (
              <p className="mt-1 text-center text-[10px] text-muted-foreground/40">今日日程已全部结束</p>
            )}
          </div>
        )}
        </div>

        {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
