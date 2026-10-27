import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openExternalLink } from "../../../lib/url";
import { useTwoStepConfirm } from "../../../lib/useTwoStepConfirm";
import { webSearch, type SearchResult } from "../../../kernel/search";
import { deleteJob, listJobs, updateJob, type JobApplication } from "../service";
import { filterJobs, searchTerms } from "../search";
import { useJobStatusStore } from "../statusStore";
import type { SortKey } from "../format";
import { compareAppliedDates } from "../date";
import { useJobsVersion } from "../changes";
import { errMsg } from "../../../lib/error";

/**
 * 求职看板的数据与筛选：列表、状态筛选、关键词（AND）、排序、补链接。
 * 弹窗开关与右键菜单属于视图，留在 JobsBoard 里。
 */
export function useJobsBoard() {
  const version = useJobsVersion((s) => s.version);
  const statuses = useJobStatusStore((s) => s.statuses);

  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "applied_at",
    dir: "desc",
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const readVersion = useRef(0);

  const del = useTwoStepConfirm();
  const [linkState, setLinkState] = useState<Record<string, "busy" | "fail">>({});
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [fillPicker, setFillPicker] = useState<{ job: JobApplication; results: SearchResult[] } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    const request = ++readVersion.current;
    setLoading(true);
    try {
      const jobs = (await listJobs()).filter((job) => job.status !== "preparing");
      if (request === readVersion.current) setJobs(jobs);
    } catch (error) { setLinkMsg(errMsg(error));
    } finally {
      if (request === readVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, version]);

  // 状态被删/改名后，若当前筛选状态已不存在 → 回到全部
  useEffect(() => {
    if (filter !== "all" && !statuses.some((s) => s.id === filter)) setFilter("all");
  }, [statuses, filter]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const j of jobs) m[j.status] = (m[j.status] ?? 0) + 1;
    return m;
  }, [jobs]);

  const statusIndex = useMemo(() => {
    const m: Record<string, number> = {};
    statuses.forEach((s, i) => (m[s.id] = i));
    return m;
  }, [statuses]);

  const visible = useMemo(() => {
    const statusName = (id: string) => statuses.find((s) => s.id === id)?.name ?? "";
    // 关键词过滤走 search.ts 的纯函数（与 Agent 的 jobs_list(keyword) 同一套规则）
    const base = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);
    const list = filterJobs(base, query, statusName);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "company":
          return a.company.localeCompare(b.company, "zh-CN") * dir;
        case "position":
          return a.position.localeCompare(b.position, "zh-CN") * dir;
        case "status":
          return ((statusIndex[a.status] ?? 99) - (statusIndex[b.status] ?? 99)) * dir;
        default:
          return compareAppliedDates(a.applied_at, b.applied_at, sort.dir);
      }
    });
  }, [jobs, filter, sort, statusIndex, query, statuses]);

  /** 搜索关键词（小写、已去空），用于高亮 */
  const terms = useMemo(() => searchTerms(query), [query]);

  // 快捷键：`/` 聚焦搜索框，Esc 清空（正在输入框里打字时不抢键）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && el === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const clearSearch = () => {
    setQuery("");
    searchRef.current?.focus();
  };

  const changeStatus = async (id: string, status: string) => {
    await updateJob(id, { status });
    await refresh();
  };

  /** 删除：点两次才落库。 */
  const removeJob = async (id: string) => {
    if (!del.armed(id)) return;
    await deleteJob(id);
    await refresh();
  };

  const openLink = async (url: string) => {
    const msg = await openExternalLink(url);
    if (msg) {
      setLinkMsg(msg);
      setTimeout(() => setLinkMsg(null), 4000);
    }
  };

  /** 无链接记录：搜索"公司名 招聘 校招 公众号"，弹出候选让用户选择。 */
  const openFillPicker = async (j: JobApplication) => {
    const drop = () =>
      setLinkState((s) => {
        const next = { ...s };
        delete next[j.id];
        return next;
      });

    setLinkState((s) => ({ ...s, [j.id]: "busy" }));
    try {
      const { results } = await webSearch(`${j.company} 招聘 校招 公众号`, 6);
      if (results.length === 0) throw new Error("no result");
      setFillPicker({ job: j, results });
      drop();
    } catch {
      // 失败保留「没搜到」，用户下次点击即重试（别在 finally 里立刻清掉，否则一闪就没）
      setLinkState((s) => ({ ...s, [j.id]: "fail" }));
    }
  };

  const pickLink = async (url: string) => {
    const job = fillPicker?.job;
    if (!job) return;
    await updateJob(job.id, { url });
    setFillPicker(null);
    await refresh();
  };

  return {
    statuses,
    jobs,
    loading,
    filter,
    setFilter,
    query,
    setQuery,
    searchRef,
    sort,
    toggleSort,
    counts,
    visible,
    terms,
    refresh,
    confirmDel: del.pendingKey,
    removeJob,
    changeStatus,
    linkState,
    linkMsg,
    fillPicker,
    setFillPicker,
    openFillPicker,
    pickLink,
    openLink,
    clearSearch,
  };
}
