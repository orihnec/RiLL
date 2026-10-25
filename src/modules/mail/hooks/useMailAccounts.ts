import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUiStore } from "../../../stores/uiStore";
import { useMailStore } from "../../../stores/mailStore";
import { refreshUnreadBadge } from "../notify-core";
import { healThreads, listAccounts, listFolders, recomputeFolderStats, type MailAccount, type MailFolder } from "../service";

type Flash = (kind: "ok" | "err", text: string) => void;

/**
 * 账号树：账号、文件夹、展开态、当前选中的账号/文件夹。
 *
 * ⚠️ 两个 effect 的顺序就是语义，勿调换：
 *   1) 打开邮箱 → 加载账号 + **会话自愈**（老数据 thread_id 为空时补算，
 *      否则列表会把每封邮件都当成一个会话 → "显示 N 个会话、点进去空白"）
 *   2) 首次拿到账号 → 自动选中收件箱
 */
export function useMailAccounts({
  flash,
  setReloadKey,
}: {
  flash: Flash;
  setReloadKey: Dispatch<SetStateAction<number>>;
}) {
  // "邮箱是否可见" = 当前是不是停在邮箱页面（不再用 mailStore.open 当开关，避免导航回弹）
  const open = useUiStore((s) => s.appView === "mail");
  const version = useMailStore((s) => s.version);

  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [folders, setFolders] = useState<Record<string, MailFolder[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const loadAccounts = useCallback(async (): Promise<MailAccount[]> => {
    const list = await listAccounts();
    // 按本地邮件表校准 total / unread（服务器口径不可靠，详见 recomputeFolderStats）
    for (const a of list) await recomputeFolderStats(a.id);
    setAccounts(list);
    const map: Record<string, MailFolder[]> = {};
    for (const a of list) map[a.id] = await listFolders(a.id);
    setFolders(map);
    setExpanded((prev) => {
      const next = { ...prev };
      for (const a of list) if (next[a.id] === undefined) next[a.id] = true;
      return next;
    });
    setActiveAccountId((prev) => prev ?? list[0]?.id ?? null);
    void refreshUnreadBadge();
    return list;
  }, []);

  // 1) 打开邮箱：加载账号 + 会话自愈
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const list = await loadAccounts();
      if (list.length === 0) return;
      const healed = await healThreads();
      if (cancelled || healed === 0) return;
      setReloadKey((k) => k + 1);
      flash("ok", `已自动整理 ${healed} 封邮件的会话`);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, version]);

  // 2) 首次拿到账号 → 自动选中收件箱
  useEffect(() => {
    if (activeFolderId || accounts.length === 0) return;
    const first = accounts[0];
    const inbox = (folders[first.id] ?? []).find((f) => f.special === "inbox");
    if (inbox) setActiveFolderId(inbox.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, folders, activeFolderId]);

  const activeFolder = useMemo(() => {
    for (const list of Object.values(folders)) {
      const f = list.find((x) => x.id === activeFolderId);
      if (f) return f;
    }
    return null;
  }, [folders, activeFolderId]);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  /** 开了实时接收的账号数（标题栏显示"已连 N/M"） */
  const notifyAccounts = useMemo(() => accounts.filter((a) => a.notify).length, [accounts]);

  return {
    accounts,
    setAccounts,
    folders,
    setFolders,
    expanded,
    setExpanded,
    activeAccountId,
    setActiveAccountId,
    activeFolderId,
    setActiveFolderId,
    activeAccount,
    activeFolder,
    notifyAccounts,
    loadAccounts,
  };
}
