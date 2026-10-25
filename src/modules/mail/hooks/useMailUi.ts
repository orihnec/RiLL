import { useCallback, useRef, useState } from "react";
import type { CtxMenuItem } from "../../../components/ui/ContextMenu";
import type { MailAccount, MailThread } from "../service";
import { errText } from "../format";

export interface MenuState {
  x: number;
  y: number;
  items: CtxMenuItem[];
}

/**
 * 邮箱面板的**界面态**：忙碌标记、进度、提示条、右键菜单、各种弹窗开关。
 *
 * 纯 UI，不碰数据 —— 由 useMailWorkspace 组合进业务逻辑。
 * `run(label, fn)` 把「置 busy → 执行 → 失败提示 → 复位」收成一处（原来 11 个动作各写一遍）。
 */
export function useMailUi() {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [tip, setTip] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [ctx, setCtx] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; editing: MailAccount | null }>({
    open: false,
    editing: null,
  });
  const [movePicker, setMovePicker] = useState<MailThread | null>(null);
  /** 未缓存正文的封数 / 乱码正文的封数（顶部按钮上的计数） */
  const [missing, setMissing] = useState(0);
  const [badBodies, setBadBodies] = useState(0);
  /** 会话/正文重算后自增，触发列表重载 */
  const [reloadKey, setReloadKey] = useState(0);
  /** 二级阅读界面：正在全屏阅读的那封（在 messages 里的下标） */
  const [readerIndex, setReaderIndex] = useState<number | null>(null);
  /** AI 排程：扫描前的成本确认 + 待确认候选面板 */
  const [scanAsk, setScanAsk] = useState<{ messages: number; chars: number; skippedNoBody: number } | null>(
    null,
  );
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pending, setPending] = useState(0);

  /** 会话列表滚动容器（loadMore 用） */
  const listRef = useRef<HTMLDivElement>(null);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setTip({ kind, text });
    window.setTimeout(() => setTip((t) => (t?.text === text ? null : t)), 6000);
  }, []);

  const run = useCallback(
    async (label: string, fn: () => Promise<void>, opts?: { progress?: boolean }) => {
      setBusy(label);
      if (opts?.progress) setProgress("");
      try {
        await fn();
      } catch (e) {
        flash("err", errText(e));
      } finally {
        setBusy(null);
        if (opts?.progress) setProgress("");
      }
    },
    [flash],
  );

  return {
    busy,
    setBusy,
    progress,
    setProgress,
    tip,
    setTip,
    ctx,
    setCtx,
    dialog,
    setDialog,
    movePicker,
    setMovePicker,
    missing,
    setMissing,
    badBodies,
    setBadBodies,
    reloadKey,
    setReloadKey,
    readerIndex,
    setReaderIndex,
    scanAsk,
    setScanAsk,
    scheduleOpen,
    setScheduleOpen,
    pending,
    setPending,
    listRef,
    flash,
    run,
  };
}
