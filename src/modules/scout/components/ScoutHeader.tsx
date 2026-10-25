import { CloudDownload, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import { CAMPUS_PAGE_URL } from "../crawl";
import type { CampusStats } from "../service";

/** 顶部：标题 + 统计胶囊 + 抓取/刷新/清空 + 抓取进度 + 提示条。 */
export function ScoutHeader({
  stats,
  crawling,
  crawlMsg,
  progress,
  pct,
  loading,
  confirmClear,
  canClear,
  tip,
  onCrawl,
  onRefresh,
  onClear,
}: {
  stats: CampusStats | null;
  crawling: boolean;
  crawlMsg: string | null;
  progress: { done: number; total: number } | null;
  pct: number;
  loading: boolean;
  confirmClear: boolean;
  canClear: boolean;
  tip: { kind: "ok" | "err"; text: string } | null;
  onCrawl: () => void;
  onRefresh: () => void;
  onClear: () => void;
}) {
  return (
    <>
      {/* 一行：统计 + 抓取/刷新/清空（标题由求职中心的页签承担，这里不再重复） */}
      <div className="flex shrink-0 items-center gap-1.5 px-4 pb-2 pt-2.5">
        {stats && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
            <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5">
              收录 <span className="tabular-nums text-foreground/80">{stats.total}</span>
            </span>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
              今日 <span className="tabular-nums">{stats.today}</span>
            </span>
            <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5">
              近 7 天 <span className="tabular-nums text-foreground/80">{stats.week}</span>
            </span>
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-amber-300">
              ★ 重点 <span className="tabular-nums">{stats.keyCount}</span>
            </span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={onCrawl}
            disabled={crawling}
            title={`从 ${CAMPUS_PAGE_URL} 抓取全部数据分片并去重入库`}
          >
            {crawling ? <Loader2 className="size-3 animate-spin" /> : <CloudDownload className="size-3" />}
            {crawling ? "抓取中…" : "抓取并入库"}
          </Button>
          <button
            onClick={onRefresh}
            disabled={loading}
            title="刷新列表"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/8 hover:text-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </button>
          <Button
            size="sm"
            variant="outline"
            onClick={onClear}
            disabled={!canClear}
            className={cn("h-7 px-2 text-[10px]", confirmClear && "border-red-400/40 bg-red-500/15 text-red-300")}
          >
            <Trash2 className="size-3" />
            {confirmClear ? "确认清空？" : "清空"}
          </Button>
        </div>
      </div>

      {crawling && (
        <div className="shrink-0 px-4 pb-2">
          <p className="flex items-center gap-1.5 text-[11px] text-indigo-300/80">
            <Loader2 className="size-3 animate-spin" />
            {crawlMsg ?? "抓取中…"}
            {progress && (
              <span className="text-muted-foreground/60">
                （{progress.done}/{progress.total} 批次 · {pct}%）
              </span>
            )}
          </p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/6">
            <div
              className="h-full rounded-full bg-indigo-400/70 transition-all duration-300"
              style={{ width: `${progress ? pct : 8}%` }}
            />
          </div>
        </div>
      )}

      {tip && (
        <div
          className={cn(
            "mx-4 mb-1.5 shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px]",
            tip.kind === "ok"
              ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-200"
              : "border-red-400/30 bg-red-500/10 text-red-200",
          )}
        >
          {tip.text}
        </div>
      )}
    </>
  );
}
