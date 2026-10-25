import { useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { cn } from "../../../lib/utils";
import type { FacetValue } from "../service";

/**
 * 多选筛选下拉（列内 OR）。
 * 打开即聚焦搜索框、已选项置顶 —— 选项上百个也能靠打字定位。
 */
export function FacetFilter({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: FacetValue[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const matched = q ? options.filter((o) => o.value.toLowerCase().includes(q)) : options;
  const shown = [
    ...matched.filter((o) => selected.includes(o.value)),
    ...matched.filter((o) => !selected.includes(o.value)),
  ];

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] transition",
            selected.length > 0
              ? "border-indigo-400/50 bg-indigo-400/12 text-indigo-200"
              : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
          {selected.length > 0 && (
            <span className="rounded-full bg-indigo-400/25 px-1 text-[9px] tabular-nums">
              {selected.length}
            </span>
          )}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 border-white/10 bg-popover p-1.5 text-popover-foreground"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="mb-1 flex h-6 items-center gap-1.5 rounded-md border border-white/10 bg-white/4 px-1.5">
          <Search className="size-3 shrink-0 text-muted-foreground/60" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`搜索${label}…`}
            className="h-5 min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/50"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="shrink-0 text-[10px] text-muted-foreground/60 transition hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>

        <div className="mb-1 flex items-center justify-between px-1 text-[10px] text-muted-foreground/55">
          <span>
            {q ? `${matched.length} / ${options.length} 个匹配` : `${options.length} 个可选值 · 可多选`}
          </span>
          {selected.length > 0 && (
            <button onClick={onClear} className="text-indigo-300 transition hover:underline">
              清除已选（{selected.length}）
            </button>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-2 py-4 text-center text-[10px] text-muted-foreground/50">
              先点「抓取并入库」拉取数据
            </p>
          ) : shown.length === 0 ? (
            <p className="px-2 py-4 text-center text-[10px] text-muted-foreground/50">
              没有匹配「{query.trim()}」的值
            </p>
          ) : (
            shown.map((o) => (
              <button
                key={o.value}
                onClick={() => onToggle(o.value)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition hover:bg-white/8"
              >
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded border transition",
                    selected.includes(o.value)
                      ? "border-indigo-400 bg-indigo-500 text-white"
                      : "border-white/20",
                  )}
                >
                  {selected.includes(o.value) && <Check className="size-2.5" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.value}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
                  {o.count}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
