import { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  Briefcase,
  CloudDownload,
  ExternalLink,
  FilterX,
  Loader2,
  Radar,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { ContextMenu, type CtxMenuItem } from "../../../components/ui/ContextMenu";
import { openExternalLink } from "../../../lib/url";
import { useTwoStepConfirm } from "../../../lib/useTwoStepConfirm";
import { deleteCampusRecruit, type CampusRecruit } from "../service";
import { CAMPUS_PAGE_URL } from "../crawl";
import { applyUrlOf, jobKeyOf, positionOf } from "../format";
import { useScoutQuery } from "../hooks/useScoutQuery";
import { useScoutCrawl } from "../hooks/useScoutCrawl";
import { useJobSync } from "../hooks/useJobSync";
import { ScoutHeader } from "./ScoutHeader";
import { ScoutFilterBar } from "./ScoutFilterBar";
import { RecruitRow } from "./RecruitRow";
import { Pager } from "./Pager";

/**
 * 校招信息库工作台。
 *
 * 页面只做组合：查询状态在 useScoutQuery，写动作在 useScoutCrawl，
 * 求职联动在 useJobSync，列表行是 RecruitCard。
 */
export function ScoutView() {
  const q = useScoutQuery();
  const crawl = useScoutCrawl({ refresh: q.refresh, resetPage: () => q.setPage(1) });
  const { jobKeys, syncingKey, syncToJobs } = useJobSync(crawl.flash);

  const del = useTwoStepConfirm();
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);

  const openLink = async (url: string | null) => {
    if (!url) return;
    const msg = await openExternalLink(url);
    if (msg) crawl.flash("ok", msg);
  };

  /** 删除：点两次才落库。 */
  const requestDelete = async (r: CampusRecruit) => {
    if (!del.armed(r.id)) return;
    await deleteCampusRecruit(r.id);
    await q.refresh();
  };

  /** 条目右键：投递 / 打开网申 / 打开来源 / 删除。 */
  const itemMenu = (e: ReactMouseEvent, r: CampusRecruit) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "去投递页面",
          icon: <ExternalLink className="size-3.5" />,
          disabled: !applyUrlOf(r),
          onSelect: () => void openLink(applyUrlOf(r)),
        },
        {
          label: "加入准备投递",
          icon: <Briefcase className="size-3.5" />,
          onSelect: () => void syncToJobs(r),
        },
        {
          label: "打开信息来源",
          icon: <ExternalLink className="size-3.5" />,
          disabled: !r.sourceLink,
          onSelect: () => void openLink(r.sourceLink),
        },
        {
          label: "删除",
          icon: <Trash2 className="size-3.5" />,
          danger: true,
          confirmLabel: "确认删除？",
          onSelect: () => void deleteCampusRecruit(r.id).then(() => void q.refresh()),
        },
      ],
    });
  };

  /** 空白右键：抓取 / 刷新 / 重置筛选。 */
  const blankMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "抓取并入库", icon: <CloudDownload className="size-3.5" />, onSelect: () => void crawl.runCrawl() },
        { label: "刷新列表", icon: <RefreshCw className="size-3.5" />, onSelect: () => void q.fetchList(q.query) },
        { label: "重置筛选", icon: <FilterX className="size-3.5" />, onSelect: q.resetFilters },
      ],
    });
  };

  const isEmpty = q.result.rows.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScoutHeader
        stats={q.stats}
        crawling={crawl.crawling}
        crawlMsg={crawl.crawlMsg}
        progress={crawl.progress}
        pct={crawl.pct}
        loading={q.loading}
        confirmClear={crawl.confirmClear}
        canClear={q.result.total !== 0 || (q.stats?.total ?? 0) !== 0}
        tip={crawl.tip}
        onCrawl={() => void crawl.runCrawl()}
        onRefresh={() => void q.fetchList(q.query)}
        onClear={() => void crawl.clearAll()}
      />

      <ScoutFilterBar
        keyword={q.keyword}
        onKeyword={q.setKeyword}
        facets={q.facets}
        selection={q.selection}
        onToggle={q.toggleValue}
        onClearFacet={q.clearFacet}
        onlyKey={q.onlyKey}
        onToggleOnlyKey={() => q.setOnlyKey((v) => !v)}
        openOnly={q.openOnly}
        onToggleOpenOnly={() => q.setOpenOnly((v) => !v)}
        sort={q.sort}
        onSort={q.setSort}
        activeFilters={q.activeFilters}
        onReset={q.resetFilters}
        loading={q.loading}
        total={q.result.total}
      />

      <div ref={q.listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-3" onContextMenu={blankMenu}>
        {q.loading && isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground/50" />
          </div>
        ) : isEmpty ? (
          <div className="mt-16 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground/60">
            <Radar className="size-6 opacity-50" />
            {q.activeFilters > 0 ? (
              "当前筛选条件下没有记录，试试放宽条件或点「重置」"
            ) : (
              <>
                信息库还是空的：点右上角「抓取并入库」一键抓取校招汇总数据（自动去重，可反复抓取刷新）
                <span className="mt-1 text-[10px] text-muted-foreground/40">数据源：{CAMPUS_PAGE_URL}</span>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {q.result.rows.map((r) => {
              const key = jobKeyOf(r.company, positionOf(r));
              return (
                <RecruitRow
                  key={r.id}
                  rec={r}
                  synced={jobKeys.has(key)}
                  syncing={syncingKey === key}
                  confirming={del.pendingKey === r.id}
                  onContextMenu={(e) => itemMenu(e, r)}
                  onApply={(url) => void openLink(url)}
                  onSync={() => void syncToJobs(r)}
                  onDelete={() => void requestDelete(r)}
                />
              );
            })}
          </div>
        )}
      </div>

      {q.result.total > 0 && (
        <Pager
          page={q.page}
          pageCount={q.pageCount}
          pageSize={q.pageSize}
          total={q.result.total}
          onPage={q.setPage}
          onPageSize={(n) => {
            q.setPageSize(n);
            q.setPage(1);
          }}
        />
      )}

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
