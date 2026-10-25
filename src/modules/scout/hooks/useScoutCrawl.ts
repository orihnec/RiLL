import { useCallback, useState } from "react";
import { errMsg } from "../../../lib/error";
import { crawlCampusRecruits } from "../crawl";
import { deleteAllCampusRecruits } from "../service";

export type Flash = (kind: "ok" | "err", text: string) => void;

/**
 * 抓取入库 / 清空 两个写动作 + 顶部提示条。
 *
 * 抓取：读取分片清单 → 逐片下载 → 去重入库（crawl.ts），期间上报分片进度。
 * 清空：两步确认。
 */
export function useScoutCrawl({
  refresh,
  resetPage,
}: {
  refresh: () => Promise<void>;
  resetPage: () => void;
}) {
  const [crawling, setCrawling] = useState(false);
  const [crawlMsg, setCrawlMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [tip, setTip] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const flash = useCallback<Flash>((kind, text) => {
    setTip({ kind, text });
    setTimeout(() => setTip(null), kind === "err" ? 9000 : 6000);
  }, []);

  /** ★ 核心动作：抓取全部数据分片 → 去重入库。 */
  const runCrawl = useCallback(async () => {
    if (crawling) return;
    setCrawling(true);
    setTip(null);
    setProgress(null);
    setCrawlMsg("正在读取数据清单…");
    try {
      const r = await crawlCampusRecruits((p) => {
        setCrawlMsg(p.message);
        if (p.phase === "shards" && p.total) setProgress({ done: p.done ?? 0, total: p.total });
      });
      setCrawlMsg(null);
      const mismatch =
        r.fetched !== r.declaredTotal
          ? `（页面标注 ${r.declaredTotal} 条，实际 ${r.fetched} 条）`
          : "";
      flash(
        "ok",
        `抓取完成${mismatch}：${r.shards} 个批次 / ${r.fetched} 条源数据 → 新增 ${r.created} 条、刷新 ${r.updated} 条` +
          (r.dupInBatch > 0 ? `、源内重复合并 ${r.dupInBatch} 条` : "") +
          (r.skipped > 0 ? `、字段缺失跳过 ${r.skipped} 条` : ""),
      );
      resetPage();
      await refresh();
    } catch (e) {
      setCrawlMsg(null);
      flash("err", `抓取失败：${errMsg(e)}`);
    } finally {
      setCrawling(false);
      setProgress(null);
    }
  }, [crawling, flash, refresh, resetPage]);

  /** 清空全部（两步确认）。 */
  const clearAll = useCallback(async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 2500);
      return;
    }
    await deleteAllCampusRecruits();
    setConfirmClear(false);
    resetPage();
    flash("ok", "校招信息库已清空");
    await refresh();
  }, [confirmClear, flash, refresh, resetPage]);

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return { crawling, crawlMsg, progress, pct, confirmClear, tip, flash, runCrawl, clearAll };
}
