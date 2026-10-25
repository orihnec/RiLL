import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { ColorPicker } from "../../../components/ui/ColorPicker";
import { JOB_STATUS_PALETTE, useJobStatusStore } from "../statusStore";
import { cn } from "../../../lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 求职状态管理：重命名、排序、自选颜色、增删；删除状态时其投递自动归入第一个状态。 */
export function JobStatusManagerDialog({ open, onClose }: Props) {
  const statuses = useJobStatusStore((s) => s.statuses);
  const add = useJobStatusStore((s) => s.add);
  const update = useJobStatusStore((s) => s.update);
  const remove = useJobStatusStore((s) => s.remove);
  const move = useJobStatusStore((s) => s.move);
  const reset = useJobStatusStore((s) => s.reset);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const nextColor = () => JOB_STATUS_PALETTE[statuses.length % JOB_STATUS_PALETTE.length];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && (setConfirmDel(null), onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>状态管理</DialogTitle>
          <DialogDescription>
            自定义求职状态：可重命名、上下排序、自选颜色；删除状态时其投递会自动归入第一个状态。
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto py-1">
          {statuses.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/3 px-2 py-1.5"
            >
              <ColorPicker value={s.color} onChange={(hex) => void update(s.id, { color: hex })} />
              <Input
                value={s.name}
                onChange={(e) => void update(s.id, { name: e.target.value })}
                className="h-7 flex-1 bg-transparent text-xs"
                placeholder="状态名称"
              />
              <button
                onClick={() => move(s.id, "up")}
                disabled={i === 0}
                title="上移"
                className="rounded-md p-1 text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                onClick={() => move(s.id, "down")}
                disabled={i === statuses.length - 1}
                title="下移"
                className="rounded-md p-1 text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                onClick={() => {
                  if (confirmDel === s.id) {
                    setConfirmDel(null);
                    void remove(s.id);
                  } else {
                    setConfirmDel(s.id);
                    setTimeout(() => setConfirmDel(null), 2500);
                  }
                }}
                disabled={statuses.length <= 1}
                title={statuses.length <= 1 ? "至少保留一个状态" : "删除状态"}
                className={cn(
                  "rounded-md p-1 transition disabled:opacity-30",
                  confirmDel === s.id
                    ? "bg-red-500/20 text-red-300"
                    : "text-muted-foreground/60 hover:bg-white/8 hover:text-red-300",
                )}
              >
                {confirmDel === s.id ? (
                  <span className="px-0.5 text-[10px]">确认？</span>
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => void add("新状态", nextColor())}
          >
            <Plus className="size-3.5" /> 新增状态
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto gap-1.5" onClick={() => void reset()}>
            <RotateCcw className="size-3.5" /> 恢复默认
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
