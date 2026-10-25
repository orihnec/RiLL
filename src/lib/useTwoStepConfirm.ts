import { useEffect, useRef, useState } from "react";

/**
 * 两步确认（WebView2 没有 `confirm()`，危险操作只能点两次）。
 *
 * `armed(key)`：第一次调用返回 false 并进入待确认；`windowMs` 内再次调用同一 key
 * 返回 true 并自动复位。`windowMs = 0` 表示不自动复位（必须再点同一目标）。
 *
 * 原来 7 个地方各自维护 `confirmDel` 状态 + `setTimeout(2500)` + 手动复位，
 * 这里收成一处，避免"有的会超时、有的不会"这种不一致。
 */
export function useTwoStepConfirm(windowMs = 2500) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // 组件卸载时清掉未触发的定时器
  useEffect(() => clearTimer, []);

  /** 返回 true = 这是第二次点击，可以执行了。 */
  const armed = (key: string): boolean => {
    clearTimer();
    if (pendingKey === key) {
      setPendingKey(null);
      return true;
    }
    setPendingKey(key);
    if (windowMs > 0) timer.current = window.setTimeout(() => setPendingKey(null), windowMs);
    return false;
  };

  const reset = () => {
    clearTimer();
    setPendingKey(null);
  };

  return { pendingKey, armed, reset };
}
