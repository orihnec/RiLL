import { Clock, FilterX, Search, Star } from "lucide-react";
import { cn } from "../../../lib/utils";
import {
  CAMPUS_FACET_COLUMNS,
  CAMPUS_SORT_OPTIONS,
  type CampusFacetKey,
  type CampusFacets,
  type CampusSort,
  type FacetValue,
} from "../service";
import type { FacetSelection } from "../format";
import { FacetFilter } from "./FacetFilter";
import { SortControl } from "./SortControl";

/** 检索 + 多列筛选 + 排序 + 命中数。 */
export function ScoutFilterBar({
  keyword,
  onKeyword,
  facets,
  selection,
  onToggle,
  onClearFacet,
  onlyKey,
  onToggleOnlyKey,
  openOnly,
  onToggleOpenOnly,
  sort,
  onSort,
  activeFilters,
  onReset,
  loading,
  total,
}: {
  keyword: string;
  onKeyword: (v: string) => void;
  facets: CampusFacets;
  selection: FacetSelection;
  onToggle: (key: CampusFacetKey, value: string) => void;
  onClearFacet: (key: CampusFacetKey) => void;
  onlyKey: boolean;
  onToggleOnlyKey: () => void;
  openOnly: boolean;
  onToggleOpenOnly: () => void;
  sort: CampusSort;
  onSort: (s: CampusSort) => void;
  activeFilters: number;
  onReset: () => void;
  loading: boolean;
  total: number;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-4 pb-2">
      <div className="flex h-7 w-56 items-center gap-1.5 rounded-lg border border-white/10 bg-white/4 px-2">
        <Search className="size-3 shrink-0 text-muted-foreground/60" />
        <input
          value={keyword}
          onChange={(e) => onKeyword(e.target.value)}
          placeholder="搜索：公司 / 岗位 / 地点 / 来源…"
          className="h-6 min-w-0 flex-1 bg-transparent text-ui-11 outline-none placeholder:text-muted-foreground/50"
        />
        {keyword && (
          <button
            onClick={() => onKeyword("")}
            className="shrink-0 text-ui-10 text-muted-foreground/60 transition hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      {CAMPUS_FACET_COLUMNS.map((f) => (
        <FacetFilter
          key={f.key}
          label={f.label}
          options={facets[f.key] as FacetValue[]}
          selected={selection[f.key]}
          onToggle={(v) => onToggle(f.key, v)}
          onClear={() => onClearFacet(f.key)}
        />
      ))}

      <button
        onClick={onToggleOnlyKey}
        className={cn(
          "flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-ui-11 transition",
          onlyKey
            ? "border-amber-400/50 bg-amber-400/12 text-amber-200"
            : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
        )}
      >
        <Star className={cn("size-3", onlyKey && "fill-amber-300")} />
        仅看重点
      </button>

      <button
        onClick={onToggleOpenOnly}
        title="只看截止日期还没过的（截止为空/无法识别的一律保留）"
        className={cn(
          "flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-ui-11 transition",
          openOnly
            ? "border-emerald-400/50 bg-emerald-400/12 text-emerald-200"
            : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
        )}
      >
        <Clock className={cn("size-3", openOnly && "text-emerald-300")} />
        还能投递
      </button>

      {activeFilters > 0 && (
        <button
          onClick={onReset}
          className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-white/8 bg-white/3 px-2 text-ui-11 text-muted-foreground transition hover:text-foreground"
        >
          <FilterX className="size-3" />
          重置（{activeFilters}）
        </button>
      )}

      <SortControl sort={sort} onChange={onSort} />

      <span className="ml-auto text-ui-10 text-muted-foreground/60">
        {loading
          ? "查询中…"
          : `命中 ${total} 条${
              sort.key === "default"
                ? ""
                : ` · 按${CAMPUS_SORT_OPTIONS.find((o) => o.key === sort.key)?.label}${sort.dir === "asc" ? "正序" : "倒序"}${
                    sort.key === "deadline" ? "（无截止日期的在最后）" : ""
                  }`
            }`}
      </span>
    </div>
  );
}
