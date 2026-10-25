import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScoutStore } from "../../../stores/scoutStore";
import {
  CAMPUS_FACET_COLUMNS,
  DEFAULT_SORT,
  campusFacets,
  campusStats,
  listCampusRecruits,
  type CampusFacetKey,
  type CampusFacets,
  type CampusListResult,
  type CampusQuery,
  type CampusSort,
  type CampusStats,
} from "../service";
import { EMPTY_FACETS, EMPTY_SELECTION, PAGE_SIZES, type FacetSelection } from "../format";

const EMPTY_RESULT: CampusListResult = { rows: [], total: 0, limited: false, offset: 0, limit: 50 };

/**
 * 校招信息库的查询状态：关键词（防抖）、多列筛选、排序、分页，
 * 以及列表 / 统计 / 候选值的取数与刷新。
 *
 * 页面只消费返回值，不再自己管这些状态。
 */
export function useScoutQuery() {
  const listRef = useRef<HTMLDivElement>(null);

  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selection, setSelection] = useState<FacetSelection>(EMPTY_SELECTION);
  const [onlyKey, setOnlyKey] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<CampusSort>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const [result, setResult] = useState<CampusListResult>(EMPTY_RESULT);
  const [stats, setStats] = useState<CampusStats | null>(null);
  const [facets, setFacets] = useState<CampusFacets>(EMPTY_FACETS);
  const [loading, setLoading] = useState(true);

  // 关键词防抖（避免每次按键都查库）
  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword), 250);
    return () => clearTimeout(t);
  }, [keyword]);

  // 筛选/排序/每页条数变化 → 回到第一页（渲染期同步纠正，避免先用旧页码查一次再跳页）
  const filterSig = `${debounced}\u0001${JSON.stringify(selection)}\u0001${onlyKey}\u0001${openOnly}\u0001${sort.key}\u0001${sort.dir}\u0001${pageSize}`;
  const [lastSig, setLastSig] = useState(filterSig);
  if (lastSig !== filterSig) {
    setLastSig(filterSig);
    setPage(1);
  }

  const query = useMemo<CampusQuery>(
    () => ({
      keyword: debounced,
      batch: selection.batch,
      month: selection.month,
      industry: selection.industry,
      nature: selection.nature,
      location: selection.location,
      linkSource: selection.linkSource,
      onlyKey,
      openOnly,
      sort,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [debounced, selection, onlyKey, openOnly, sort, pageSize, page],
  );

  const fetchList = useCallback(async (q: CampusQuery) => {
    setLoading(true);
    try {
      const [res, st] = await Promise.all([listCampusRecruits(q), campusStats()]);
      setResult(res);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFacets = useCallback(async () => {
    setFacets(await campusFacets());
  }, []);

  /** 写入（抓取/删除/清空）后：列表 + 统计 + 候选值一起刷新。 */
  const refresh = useCallback(async () => {
    await Promise.all([fetchList(query), fetchFacets()]);
  }, [fetchList, fetchFacets, query]);

  // 查询条件变化 / AI 工具改了数据（版本号变化）→ 重新取列表
  const dataVersion = useScoutStore((s) => s.version);
  useEffect(() => {
    void fetchList(query);
  }, [fetchList, query, dataVersion]);
  useEffect(() => {
    void fetchFacets();
  }, [fetchFacets, dataVersion]);

  // 换页后把列表滚回顶部
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const toggleValue = useCallback((key: CampusFacetKey, value: string) => {
    setSelection((s) => {
      const cur = s[key];
      return { ...s, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });
  }, []);

  const clearFacet = useCallback((key: CampusFacetKey) => {
    setSelection((s) => ({ ...s, [key]: [] }));
  }, []);

  const resetFilters = useCallback(() => {
    setSelection(EMPTY_SELECTION);
    setOnlyKey(false);
    setOpenOnly(false);
    setKeyword("");
  }, []);

  const activeFilters =
    CAMPUS_FACET_COLUMNS.reduce((n, f) => n + selection[f.key].length, 0) +
    (onlyKey ? 1 : 0) +
    (openOnly ? 1 : 0) +
    (keyword.trim() ? 1 : 0);

  return {
    listRef,
    keyword,
    setKeyword,
    selection,
    toggleValue,
    clearFacet,
    onlyKey,
    setOnlyKey,
    openOnly,
    setOpenOnly,
    sort,
    setSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
    activeFilters,
    resetFilters,
    result,
    stats,
    facets,
    loading,
    query,
    refresh,
    fetchList,
  };
}
