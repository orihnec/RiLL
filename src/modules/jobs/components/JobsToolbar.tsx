import { ChevronDown, Loader2, Plus, Search, Settings2, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { cn } from "../../../lib/utils";
import type { JobStatusDef } from "../statusStore";

/** 头部统计 + 状态筛选 chips + 搜索框。 */
export function JobsToolbar({
  jobsCount,
  visibleCount,
  matched,
  statuses,
  filter,
  onFilter,
  counts,
  query,
  onQuery,
  searchRef,
  onClearSearch,
  linkMsg,
  onAdd,
  onManageStatus,
}: {
  jobsCount: number;
  visibleCount: number;
  matched: boolean;
  statuses: JobStatusDef[];
  filter: string;
  onFilter: (id: string) => void;
  counts: Record<string, number>;
  query: string;
  onQuery: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onClearSearch: () => void;
  linkMsg: string | null;
  onAdd: () => void;
  onManageStatus: () => void;
}) {
  // 常驻只显示"有数据的前 5 个状态"（当前选中的一定显示），其余进「更多」
  const withCount = statuses.filter((s) => (counts[s.id] ?? 0) > 0 || s.id === filter);
  const visibleChips = withCount.slice(0, 5);
  const moreChips = statuses.filter((s) => !visibleChips.some((v) => v.id === s.id));

  return (
    <>
      {/* 一行搞定：统计 + 状态筛选 + 维护动作 + 搜索（页签与标题在外面，这里不再重复） */}
      <div className="flex shrink-0 items-center gap-1.5 px-4 pb-2 pt-2.5">
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/55">
          {matched ? `${visibleCount}/${jobsCount}` : `共 ${jobsCount} 份`}
        </span>
        {linkMsg && <span className="text-[11px] text-amber-300/90">{linkMsg}</span>}
        <button
          onClick={() => onFilter("all")}
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] tabular-nums transition",
            filter === "all"
              ? "border-indigo-400/40 bg-indigo-400/15 text-indigo-200"
              : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
          )}
        >
          全部 <span className="opacity-70">{jobsCount}</span>
        </button>
        {visibleChips.map((s) => {
          const active = filter === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onFilter(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] tabular-nums transition",
                active ? "brightness-125" : "opacity-80 hover:opacity-100",
              )}
              style={{
                background: active ? s.from : "color-mix(in oklab, var(--color-white) 4%, transparent)",
                color: active ? s.text : undefined,
                borderColor: active ? `${s.bar}66` : "color-mix(in oklab, var(--color-white) 10%, transparent)",
              }}
            >
              <span className="size-1.5 rounded-full" style={{ background: s.bar }} />
              <span className={active ? "" : "text-muted-foreground"}>{s.name}</span>
              <span className="opacity-70">{counts[s.id] ?? 0}</span>
            </button>
          );
        })}
        {moreChips.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex shrink-0 items-center gap-1 rounded-full border border-white/8 bg-white/3 px-2 py-0.5 text-[11px] text-muted-foreground transition hover:text-foreground"
                title="其余状态"
              >
                更多 <span className="opacity-60">{moreChips.length}</span>
                <ChevronDown className="size-2.5 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-44 p-1">
              {moreChips.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onFilter(s.id)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] transition hover:bg-white/8",
                    filter === s.id && "bg-white/6",
                  )}
                >
                  <span className="size-1.5 rounded-full" style={{ background: s.bar }} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="tabular-nums text-muted-foreground/60">{counts[s.id] ?? 0}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {/* 搜索 + 维护动作（同一行，不再单起一行） */}
        <div className="ml-auto flex min-w-[180px] max-w-[260px] flex-1 items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="搜索公司 / 职位 / 备注（按 / 聚焦）"
              className="h-7 w-full rounded-lg border border-white/10 bg-white/4 pl-8 pr-7 text-[11px] outline-none transition placeholder:text-muted-foreground/40 focus:border-indigo-400/50 focus:bg-white/6"
            />
            {query && (
              <button
                onClick={onClearSearch}
                title="清除（Esc）"
                className="absolute right-1.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/50 transition hover:bg-white/10 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        <button
          onClick={onManageStatus}
          title="管理状态（改名 / 配色 / 排序 / 删除）"
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground"
        >
          <Settings2 className="size-3.5" />
        </button>
        <Button size="sm" className="h-7 shrink-0 px-2.5 text-[11px]" onClick={onAdd}>
          <Plus className="size-3" /> 添加投递
        </Button>
      </div>
    </>
  );
}

/** 加载指示（表格首次加载时用）。 */
export function JobsLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground/50" />
    </div>
  );
}
