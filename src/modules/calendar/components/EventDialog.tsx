import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Repeat2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoryOf } from "../../../lib/colors";
import { useCategoryStore } from "../../../stores/categoryStore";
import { toLocalInputValue, fromLocalInputValue } from "../../../lib/time";
import {
  RECUR_OPTIONS,
  rruleString,
  freqOfRrule,
  type RecurFreq,
} from "../recurrence";
import type { EventPatch, EventTarget, NewEventInput, Occurrence } from "../service";

export interface DialogState {
  open: boolean;
  mode: "create" | "edit";
  occ?: Occurrence;
  defaultStart?: number;
  defaultEnd?: number;
}

type Scope = "this" | "series";

interface Props {
  state: DialogState;
  onClose: () => void;
  onCreate: (input: NewEventInput) => Promise<void>;
  onUpdate?: (target: EventTarget, patch: EventPatch) => Promise<void>;
  onDelete?: (target: EventTarget) => Promise<void>;
}

const toDateInput = (ms: number) => format(new Date(ms), "yyyy-MM-dd");

/** 新建/编辑事件对话框：支持重复频率与单实例/系列作用域。 */
export function EventDialog({ state, onClose, onCreate, onUpdate, onDelete }: Props) {
  const occ = state.occ;
  const isEdit = state.mode === "edit";
  const isOccurrence = !!occ?.isOccurrence;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("default");
  const [allDay, setAllDay] = useState(false);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState<RecurFreq>("none");
  const [scope, setScope] = useState<Scope>("this");
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = useCategoryStore((s) => s.categories);

  // 打开时按模式初始化表单
  useEffect(() => {
    if (!state.open) return;
    setConfirmDel(false);
    setError(null);
    if (occ) {
      setTitle(occ.title);
      setCategory(occ.category);
      setAllDay(occ.allDay);
      setStartInput(toLocalInputValue(occ.startAt));
      setEndInput(toLocalInputValue(occ.endAt));
      setStartDate(toDateInput(occ.startAt));
      setEndDate(toDateInput(occ.endAt));
      setNotes(occ.notes ?? "");
      setRepeat(freqOfRrule(occ.rrule));
      setScope(occ.isOccurrence ? "this" : "series");
    } else {
      const s = state.defaultStart ?? Date.now();
      const e = state.defaultEnd ?? s + 3_600_000;
      setTitle("");
      setCategory("default");
      setAllDay(false);
      setStartInput(toLocalInputValue(s));
      setEndInput(toLocalInputValue(e));
      setStartDate(toDateInput(s));
      setEndDate(toDateInput(e));
      setNotes("");
      setRepeat("none");
      setScope("this");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.mode, occ?.id]);

  if (!state.open) return null;

  const editingSeries = !isOccurrence || scope === "series";

  const buildInput = (): NewEventInput => {
    let start: number;
    let end: number;
    if (allDay) {
      start = new Date(`${startDate}T00:00:00`).getTime();
      end = new Date(`${endDate}T00:00:00`).getTime();
      if (end <= start) end = start + 86_400_000;
    } else {
      start = fromLocalInputValue(startInput);
      end = fromLocalInputValue(endInput);
      if (end <= start) end = start + 3_600_000;
    }
    return {
      title: title.trim(),
      startAt: start,
      endAt: end,
      allDay,
      category,
      notes: notes.trim() || null,
      rrule: rruleString(editingSeries ? repeat : "none"),
    };
  };

  const buildTarget = (): EventTarget => {
    if (isOccurrence && scope === "this") {
      return { id: occ!.masterId, occurrenceStart: occ!.originalStart };
    }
    return { id: occ!.masterId };
  };

  const save = async () => {
    if (!title.trim()) {
      setError("标题不能为空");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isEdit && occ) {
        const input = buildInput();
        const patch: EventPatch = {
          title: input.title,
          startAt: input.startAt,
          endAt: input.endAt,
          allDay: input.allDay,
          category: input.category,
          notes: input.notes,
        };
        // 单实例例外不改 master 的重复规则
        if (editingSeries) patch.rrule = input.rrule;
        await onUpdate?.(buildTarget(), patch);
      } else {
        await onCreate(buildInput());
      }
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    setBusy(true);
    try {
      await onDelete?.(buildTarget());
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const cat = categoryOf(category);
  const deleteLabel = !isOccurrence
    ? "删除"
    : scope === "this"
      ? "删除此事件"
      : "删除整个系列";

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "编辑事件" : "新建事件"}
            {isOccurrence && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                <Repeat2 className="size-2.5" /> 重复
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">事件详情</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3.5 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ev-title">标题</Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="事件标题"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && void save()}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>类别</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: c.bar, boxShadow: `0 0 8px ${c.bar}66` }}
                      />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isOccurrence && (
            <div className="flex flex-col gap-1.5">
              <Label>修改范围</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this">仅此一次</SelectItem>
                  <SelectItem value="series">整个系列</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {editingSeries && (
            <div className="flex flex-col gap-1.5">
              <Label>重复</Label>
              <Select value={repeat} onValueChange={(v) => setRepeat(v as RecurFreq)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECUR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              id="ev-allday"
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="size-3.5 accent-indigo-500"
            />
            <Label htmlFor="ev-allday" className="cursor-pointer text-xs font-normal">
              全天
            </Label>
            {!allDay && (
              <span
                className="ml-auto rounded-md px-2 py-0.5 text-[10px] tabular-nums"
                style={{ background: cat.from, color: cat.text }}
              >
                {startInput.slice(11)} – {endInput.slice(11)}
              </span>
            )}
          </div>

          {allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>开始日期</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>结束日期</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>开始</Label>
                <Input
                  type="datetime-local"
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>结束</Label>
                <Input
                  type="datetime-local"
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>备注</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="备注 / 描述"
              rows={3}
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          {isEdit && onDelete && (
            <Button
              variant="ghost"
              className="mr-auto text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => void remove()}
              disabled={busy}
            >
              {confirmDel ? "确认删除？" : deleteLabel}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "保存中…" : isEdit ? "保存" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
