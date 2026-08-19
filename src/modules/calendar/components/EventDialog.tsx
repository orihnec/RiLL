import { useEffect, useState } from "react";
import { format } from "date-fns";
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
import { CATEGORIES, categoryOf } from "../../../lib/colors";
import { toLocalInputValue, fromLocalInputValue } from "../../../lib/time";
import type { EventPatch, NewEventInput, Occurrence } from "../service";

export interface DialogState {
  open: boolean;
  mode: "create" | "edit";
  occ?: Occurrence;
  defaultStart?: number;
  defaultEnd?: number;
}

interface Props {
  state: DialogState;
  onClose: () => void;
  onCreate: (input: NewEventInput) => Promise<void>;
  onUpdate: (patch: EventPatch) => Promise<void>;
  onDelete: () => Promise<void>;
}

const toDateInput = (ms: number) => format(new Date(ms), "yyyy-MM-dd");

/** 新建/编辑事件对话框（双击空白新建，点击事件编辑）。 */
export function EventDialog({ state, onClose, onCreate, onUpdate, onDelete }: Props) {
  const occ = state.occ;
  const isEdit = state.mode === "edit";

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("default");
  const [allDay, setAllDay] = useState(false);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.mode, occ?.id]);

  if (!state.open) return null;

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
    return { title: title.trim(), startAt: start, endAt: end, allDay, category, notes: notes.trim() || null };
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
        await onUpdate({
          title: input.title,
          startAt: input.startAt,
          endAt: input.endAt,
          allDay: input.allDay,
          category: input.category,
          notes: input.notes,
        });
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
      await onDelete();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const cat = categoryOf(category);

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑事件" : "新建事件"}</DialogTitle>
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
                {CATEGORIES.map((c) => (
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
          {isEdit && (
            <Button variant="ghost" className="mr-auto text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => void remove()} disabled={busy}>
              {confirmDel ? "确认删除？" : "删除"}
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
