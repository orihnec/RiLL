import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { cn } from "../../../lib/utils";
import { useTwoStepConfirm } from "../../../lib/useTwoStepConfirm";
import { useCalendarStore } from "../../../stores/calendarStore";
import { CATEGORIES } from "../../../lib/colors";
import {
  WEEKDAY_LABELS,
  createHabit,
  deleteHabit,
  habitTimeLabel,
  listHabits,
  type Habit,
} from "../habits";

/**
 * 习惯（每天/每周固定的日程）。
 *
 * 本质是带每周 RRULE 的重复事件 —— 保存后立刻出现在日历里，可拖拽、可单独改某一天。
 */
export function HabitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reload = useCalendarStore((s) => s.reload);
  const del = useTwoStepConfirm();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [category, setCategory] = useState("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setHabits(await listHabits()), []);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await createHabit({ title, days, time, durationMinutes: duration, category });
      setTitle("");
      await load();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!del.armed(id)) return;
    await deleteHabit(id);
    await load();
    await reload();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">习惯 · 每天固定的安排</DialogTitle>
          <DialogDescription className="text-ui-11">
            保存后会作为重复日程直接出现在日历里（每周按选中的星期重复），可拖拽调整时间。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {/* 新建 */}
          <div className="rounded-xl border border-white/8 bg-white/3 p-3">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：晨跑 / 刷题 / 背单词"
                  className="h-8 flex-1 text-xs"
                />
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-8 w-24 text-xs"
                />
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-8 rounded-md border border-white/10 bg-white/4 px-2 text-xs outline-none"
                  title="时长"
                >
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m} className="bg-popover">
                      {m} 分
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <Label className="mr-1 text-ui-11 text-muted-foreground">重复</Label>
                {WEEKDAY_LABELS.map((label, d) => (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={cn(
                      "size-7 rounded-lg border text-ui-11 transition",
                      days.includes(d)
                        ? "border-indigo-400/50 bg-indigo-400/15 text-indigo-200"
                        : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="ml-auto h-7 rounded-md border border-white/10 bg-white/4 px-2 text-ui-11 outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id} className="bg-popover">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {error && <p className="text-ui-11 text-red-400">{error}</p>}

              <Button
                size="sm"
                className="h-7 self-start px-2.5 text-ui-11"
                onClick={() => void save()}
                disabled={busy || !title.trim() || days.length === 0}
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                添加习惯
              </Button>
            </div>
          </div>

          {/* 已有 */}
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {habits.length === 0 && (
              <p className="py-4 text-center text-ui-11 text-muted-foreground/60">
                还没有习惯。加一个「每天 09:00 刷题 60 分」试试。
              </p>
            )}
            {habits.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/3 px-2.5 py-1.5"
              >
                <span className="text-ui-11 tabular-nums text-muted-foreground">
                  {habitTimeLabel(h.startMinutes)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">{h.title}</span>
                <span className="shrink-0 text-ui-10 text-muted-foreground/60">
                  {h.days.length === 7
                    ? "每天"
                    : h.days.map((d) => WEEKDAY_LABELS[d]).join("")}
                  {" · "}
                  {h.durationMinutes} 分
                </span>
                <button
                  onClick={() => void remove(h.id)}
                  title="删除习惯"
                  className={cn(
                    "shrink-0 rounded-md p-1 transition",
                    del.pendingKey === h.id
                      ? "bg-red-500/20 text-red-300"
                      : "text-muted-foreground/50 hover:bg-white/8 hover:text-red-300",
                  )}
                >
                  {del.pendingKey === h.id ? (
                    <span className="px-0.5 text-ui-9">确认？</span>
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 供别处展示用：每一天是否命中（日历里标"习惯"时用）。 */
export function habitHitsDay(h: Habit, weekday: number): boolean {
  return h.days.includes(weekday);
}
