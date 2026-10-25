import { useCallback, useEffect, useState } from "react";
import { errMsg } from "../../../lib/error";
import { useScoutStore } from "../../../stores/scoutStore";
import { createJob, listJobs } from "../../jobs/service";
import { jobKeyOf, positionOf } from "../format";
import type { CampusRecruit } from "../service";
import type { Flash } from "./useScoutCrawl";

/**
 * 与求职监控的联动。
 *
 * 只做**已投递**的显示与手动同步：「去投递」只打开网申页、绝不写库，
 * 用户点「我已投递」才创建投递记录 —— 避免"看一眼"就被记成已投。
 */
export function useJobSync(flash: Flash) {
  /** 求职监控里已有的「公司+职位」集合，仅用于显示状态 */
  const [jobKeys, setJobKeys] = useState<Set<string>>(() => new Set());
  const [syncingKey, setSyncingKey] = useState<string | null>(null);

  const fetchJobKeys = useCallback(async () => {
    const jobs = await listJobs();
    setJobKeys(new Set(jobs.map((j) => jobKeyOf(j.company, j.position))));
  }, []);

  // 初次加载 + AI 工具改动校招库后 → 重算已同步集合
  const dataVersion = useScoutStore((s) => s.version);
  useEffect(() => {
    void fetchJobKeys();
  }, [dataVersion, fetchJobKeys]);

  const syncToJobs = useCallback(
    async (r: CampusRecruit) => {
      const position = positionOf(r);
      const key = jobKeyOf(r.company, position);
      if (jobKeys.has(key)) {
        flash("ok", `${r.company} · ${position.slice(0, 24)} 已经在求职中心里了`);
        return;
      }
      setSyncingKey(key);
      try {
        await createJob({
          company: r.company,
          position,
          // 进「准备投递」：真投出去后在求职中心点「已投递」
          status: "preparing",
          url: r.appLink ?? r.sourceLink ?? undefined,
          notes:
            [r.location, r.deadline ? `截止 ${r.deadline}` : null, r.linkSource]
              .filter(Boolean)
              .join(" · ") || undefined,
        });
        setJobKeys((prev) => new Set(prev).add(key));
        flash("ok", `已加入准备投递：${r.company} · ${position.slice(0, 24)}`);
        void fetchJobKeys();
      } catch (e) {
        flash("err", `加入准备投递失败：${errMsg(e)}`);
      } finally {
        setSyncingKey(null);
      }
    },
    [jobKeys, flash, fetchJobKeys],
  );

  return { jobKeys, syncingKey, syncToJobs };
}
