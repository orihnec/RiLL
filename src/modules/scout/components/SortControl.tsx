import { useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { cn } from "../../../lib/utils";
import { CAMPUS_SORT_OPTIONS, type CampusSort } from "../service";

/** 排序控件：点已选项 = 切正/倒序；点其它项 = 换排序键。 */
export function SortControl({
  sort,
  onChange,
}: {
  sort: CampusSort;
  onChange: (s: CampusSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = CAMPUS_SORT_OPTIONS.find((o) => o.key === sort.key) ?? CAMPUS_SORT_OPTIONS[0];
  const sortable = sort.key !== "default";
  const DirIcon = sort.dir === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title={`排序：${current.label}（${current.hint}）`}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] transition",
            sortable
              ? "border-indigo-400/50 bg-indigo-400/12 text-indigo-200"
              : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
          )}
        >
          <DirIcon className="size-3" />
          <span className="opacity-60">排序</span>
          {current.label}
          {sortable && (
            <span className="text-[9px] opacity-70">{sort.dir === "asc" ? "正序" : "倒序"}</span>
          )}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 border-white/10 bg-popover p-1.5 text-popover-foreground">
        <div className="mb-1 px-1 text-[10px] text-muted-foreground/55">排序方式</div>
        {CAMPUS_SORT_OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => {
              onChange(
                sort.key === o.key
                  ? { key: o.key, dir: sort.dir === "asc" ? "desc" : "asc" }
                  : { key: o.key, dir: o.key === "default" ? "desc" : sort.dir },
              );
              if (o.key === "default") setOpen(false);
            }}
            className={cn(
              "flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition hover:bg-white/8",
              sort.key === o.key && "bg-white/6",
            )}
          >
            <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
              {sort.key === o.key && <Check className="size-3 text-indigo-300" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">{o.label}</span>
              <span className="block text-[9px] text-muted-foreground/45">{o.hint}</span>
            </span>
            {sort.key === o.key && o.key !== "default" && (
              <span className="mt-0.5 shrink-0 rounded bg-indigo-400/15 px-1 text-[9px] text-indigo-200">
                {sort.dir === "asc" ? "正序" : "倒序"}
              </span>
            )}
          </button>
        ))}
        <p className="mt-1 border-t border-white/6 px-1 pt-1 text-[9px] leading-relaxed text-muted-foreground/45">
          点已选中的项可切换正序 / 倒序；日期类排序会把「无截止时间」的条目排在最后。
        </p>
      </PopoverContent>
    </Popover>
  );
}
