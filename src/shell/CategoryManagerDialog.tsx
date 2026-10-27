import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ColorPicker } from "../components/ui/ColorPicker";
import { useCategoryStore } from "../stores/categoryStore";
import { useCalendarStore } from "../stores/calendarStore";
import { CATEGORY_PALETTE } from "../lib/colors";
import { cn } from "../lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 类别管理：重命名、排序、自选颜色、增删；删除时其日程自动归入「默认」。 */
export function CategoryManagerDialog({ open, onClose }: Props) {
  const categories = useCategoryStore((s) => s.categories);
  const add = useCategoryStore((s) => s.add);
  const update = useCategoryStore((s) => s.update);
  const remove = useCategoryStore((s) => s.remove);
  const move = useCategoryStore((s) => s.move);
  const reset = useCategoryStore((s) => s.reset);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const close = () => {
    setConfirmDel(null);
    onClose();
    // 关闭时刷新一次，让进度卡片立即应用最新颜色/顺序
    void useCalendarStore.getState().reload();
  };

  const nextColor = () =>
    CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>类别管理</DialogTitle>
          <DialogDescription>
            可重命名、上下调整顺序、自选颜色；删除类别时其日程会自动归入「默认」。
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto py-1">
          {categories.map((c, i) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/3 px-2 py-1.5"
            >
              <ColorPicker
                value={c.color}
                onChange={(hex) => void update(c.id, { color: hex })}
              />
              <Input
                value={c.name}
                onChange={(e) => void update(c.id, { name: e.target.value })}
                className="h-7 flex-1 bg-transparent text-xs"
                placeholder="类别名称"
              />
              <button
                onClick={() => move(c.id, "up")}
                disabled={i === 0}
                title="上移"
                className="rounded-md p-1 text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                onClick={() => move(c.id, "down")}
                disabled={i === categories.length - 1}
                title="下移"
                className="rounded-md p-1 text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                onClick={() => {
                  if (confirmDel === c.id) {
                    setConfirmDel(null);
                    void remove(c.id);
                  } else {
                    setConfirmDel(c.id);
                    setTimeout(() => setConfirmDel(null), 2500);
                  }
                }}
                disabled={categories.length <= 1}
                title={categories.length <= 1 ? "至少保留一个类别" : "删除类别"}
                className={cn(
                  "rounded-md p-1 transition disabled:opacity-30",
                  confirmDel === c.id
                    ? "bg-red-500/20 text-red-300"
                    : "text-muted-foreground/60 hover:bg-white/8 hover:text-red-300",
                )}
              >
                {confirmDel === c.id ? <span className="px-0.5 text-ui-10">确认？</span> : <Trash2 className="size-3.5" />}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => void add("新类别", nextColor())}
          >
            <Plus className="size-3.5" /> 新增类别
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto gap-1.5"
            onClick={() => void reset()}
          >
            <RotateCcw className="size-3.5" /> 恢复默认
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
