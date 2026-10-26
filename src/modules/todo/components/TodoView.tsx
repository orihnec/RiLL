import { useCallback, useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  CalendarDays,
  Check,
  CheckSquare,
  Clock,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { ContextMenu, type CtxMenuItem } from "../../../components/ui/ContextMenu";
import { createTodo, deleteTodo, listTodos, toggleTodo, updateTodo, type Todo } from "../service";
import { listOccurrences, type Occurrence } from "../../calendar/service";
import { cn } from "../../../lib/utils";

const toDateInput = (ms: number | null) => {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const toTimeInput = (ms: number | null) => {
  if (!ms) return "";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function dueLabel(t: Todo): string {
  const base = t.dueAt
    ? `计划 ${new Date(t.dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
    : t.eventTitle
      ? `绑定日程：${t.eventTitle}`
      : null;
  if (base) return base;
  return t.eventTitle ? `绑定日程：${t.eventTitle}` : "无时间";
}

/** 创建/编辑待办表单（可绑定日程）。 */
function TodoFormDialog({
  open,
  todo,
  events,
  onClose,
  onSaved,
}: {
  open: boolean;
  todo: Todo | null;
  events: Occurrence[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [eventId, setEventId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(todo?.title ?? "");
    setDate(toDateInput(todo?.dueAt ?? null));
    setTime(toTimeInput(todo?.dueAt ?? null));
    setEventId(todo?.eventId ?? "");
    setNotes(todo?.notes ?? "");
  }, [open, todo]);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const dueAt = date ? new Date(`${date}T${time || "09:00"}:00`).getTime() : null;
      if (todo) {
        await updateTodo(todo.id, {
          title,
          dueAt,
          eventId: eventId || null,
          notes,
        });
      } else {
        await createTodo({ title, dueAt: dueAt ?? undefined, eventId: eventId || undefined, notes });
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{todo ? "编辑待办" : "添加待办"}</DialogTitle>
          <DialogDescription className="sr-only">待办</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1 text-sm">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">内容 *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="要做什么…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">计划日期</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">时间</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">绑定日程（可选，未来 7 天）</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="不绑定" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">不绑定</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {new Date(e.startAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}{" "}
                    {e.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">备注（可选）</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={busy || !title.trim()}>
            {busy ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 待办工作台：未完成/已完成 + 添加/编辑/绑定日程。 */
export function TodoView() {
  const [open, setOpen] = useState<Todo[]>([]);
  const [done, setDone] = useState<Todo[]>([]);
  const [events, setEvents] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [o, d, ev] = await Promise.all([
        listTodos("open"),
        listTodos("done"),
        listOccurrences(Date.now(), Date.now() + 7 * 24 * 3_600_000),
      ]);
      setOpen(o);
      setDone(d);
      setEvents(ev);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** 待办条目右键：标记完成/恢复 / 编辑 / 删除。 */
  const itemMenu = (e: ReactMouseEvent, t: Todo) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: t.done ? "恢复未完成" : "标记完成",
          icon: t.done ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />,
          onSelect: () => void toggleTodo(t.id).then(() => refresh()),
        },
        {
          label: "编辑",
          icon: <Pencil className="size-3.5" />,
          onSelect: () => {
            setEditing(t);
            setFormOpen(true);
          },
        },
        {
          label: "删除",
          icon: <Trash2 className="size-3.5" />,
          danger: true,
          confirmLabel: "确认删除？",
          onSelect: () => void deleteTodo(t.id).then(() => refresh()),
        },
      ],
    });
  };

  /** 列表空白右键：添加待办 / 刷新。 */
  const blankMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "添加待办",
          icon: <Plus className="size-3.5" />,
          onSelect: () => {
            setEditing(null);
            setFormOpen(true);
          },
        },
        {
          label: "刷新",
          icon: <RefreshCw className="size-3.5" />,
          onSelect: () => void refresh(),
        },
      ],
    });
  };

  return (
    <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl">
      {/* 头部 */}
      <div className="flex shrink-0 items-center gap-2 px-4 py-3">
        <CheckSquare className="size-4 text-indigo-300" />
        <span className="text-sm font-semibold">待办</span>
        <span className="text-ui-10 text-muted-foreground/60">
          未完成 {open.length} · 已完成 {done.length} · 可与日程绑定，悬浮窗显示今日待办
        </span>
        <Button
          size="sm"
          className="ml-auto h-7 px-2.5 text-ui-11"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-3" /> 添加待办
        </Button>
      </div>

      {/* 列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4" onContextMenu={blankMenu}>
        {loading && open.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground/50" />
          </div>
        ) : open.length === 0 && done.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground/60">
            <CheckSquare className="size-6 opacity-50" />
            还没有待办，点「添加待办」或在聊天里说「记一下 XX」
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {open.map((t) => (
              <div
                key={t.id}
                onContextMenu={(e) => itemMenu(e, t)}
                className="group flex items-center gap-2.5 rounded-xl border border-white/6 bg-white/3 px-3 py-2 transition hover:bg-white/5"
              >
                <button
                  onClick={() => void toggleTodo(t.id).then(() => refresh())}
                  title="标记完成"
                  className="flex size-4 shrink-0 items-center justify-center rounded border border-white/20 transition hover:border-emerald-400/60 hover:bg-emerald-400/10"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{t.title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-ui-10 text-muted-foreground/60">
                    {t.dueAt ? <Clock className="size-2.5" /> : t.eventTitle ? <CalendarDays className="size-2.5" /> : null}
                    {dueLabel(t)}
                    {t.eventId && t.eventTitle && (
                      <span className="truncate rounded bg-indigo-400/10 px-1 py-px text-indigo-300/80">
                        📅 {t.eventTitle}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => {
                      setEditing(t);
                      setFormOpen(true);
                    }}
                    title="编辑"
                    className="rounded-md p-1 text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirmDel === t.id) {
                        await deleteTodo(t.id);
                        setConfirmDel(null);
                        await refresh();
                      } else {
                        setConfirmDel(t.id);
                        setTimeout(() => setConfirmDel(null), 2500);
                      }
                    }}
                    title="删除"
                    className={cn(
                      "rounded-md p-1 transition",
                      confirmDel === t.id
                        ? "bg-red-500/20 text-red-300"
                        : "text-muted-foreground/60 hover:bg-white/8 hover:text-red-300",
                    )}
                  >
                    {confirmDel === t.id ? <span className="px-0.5 text-ui-10">确认？</span> : <Trash2 className="size-3.5" />}
                  </button>
                </div>
              </div>
            ))}

            {done.length > 0 && (
              <>
                <div className="mt-3 flex items-center gap-2 text-ui-10 font-semibold text-muted-foreground/50">
                  已完成（{done.length}）
                  <span className="h-px flex-1 bg-white/6" />
                </div>
                {done.slice(0, 50).map((t) => (
                  <div
                    key={t.id}
                    onContextMenu={(e) => itemMenu(e, t)}
                    className="group flex items-center gap-2.5 rounded-xl border border-white/4 bg-white/2 px-3 py-1.5 opacity-60 transition hover:opacity-100"
                  >
                    <button
                      onClick={() => void toggleTodo(t.id).then(() => refresh())}
                      title="恢复未完成"
                      className="flex size-4 shrink-0 items-center justify-center rounded border border-emerald-400/40 bg-emerald-400/15"
                    >
                      <span className="size-2 rounded-full bg-emerald-400" />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm line-through text-muted-foreground/70">{t.title}</span>
                    <button
                      onClick={async () => {
                        await deleteTodo(t.id);
                        await refresh();
                      }}
                      title="删除"
                      className="rounded-md p-1 text-muted-foreground/40 opacity-0 transition group-hover:opacity-100 hover:text-red-300"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <TodoFormDialog
        open={formOpen}
        todo={editing}
        events={events}
        onClose={() => setFormOpen(false)}
        onSaved={() => void refresh()}
      />
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
