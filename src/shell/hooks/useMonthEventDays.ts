import { useEffect, useState } from "react";
import { endOfMonth, startOfDay, startOfMonth } from "date-fns";
import * as calendarService from "../../modules/calendar/service";
import { DAY_MS } from "../../lib/time";

/**
 * 小月历的"有事件的日子"标记。
 * 组件只渲染；查询、取消与失败兜底都收在这里。
 */
export function useMonthEventDays(month: Date): Set<number> {
  const [days, setDays] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const start = startOfMonth(month).getTime();
    const end = endOfMonth(month).getTime();
    let cancelled = false;
    void calendarService
      .listOccurrences(start, end + DAY_MS)
      .then((occs) => {
        if (cancelled) return;
        const next = new Set<number>();
        for (const o of occs) next.add(startOfDay(o.startAt).getTime());
        setDays(next);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  return days;
}
