import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMailStore } from "../../../stores/mailStore";
import { useUiStore } from "../../../stores/uiStore";
import { applyMailWatch } from "../watch";
import { rebuildThreads, syncAllAccounts, syncFolder } from "../sync";
import { estimateScan, extractThread, pendingCount, scanFolder } from "../extract";
import { PAGE_SIZE, errText } from "../format";
import {
  applyFlagsLocal,
  countBadBodies,
  countMissingBodies,
  deleteAccount,
  folderCounts,
  healThreads,
  listThreadMessages,
  listThreads,
  prefetchBodies,
  removeMessagesLocal,
  repairBodies,
  setFlagsRemote,
  moveRemote,
  threadIdOfMessage,
  updateAccount,
  updateFolderStats,
  type MailAccount,
  type MailFolder,
  type MailMessage,
  type MailThread,
} from "../service";
import type { CtxMenuItem } from "../../../components/ui/ContextMenu";

export type MailWorkspace = ReturnType<typeof useMailWorkspace>;

import { useMailUi } from "./useMailUi";
import { useMailAccounts } from "./useMailAccounts";

export interface MenuState {
  x: number;
  y: number;
  items: CtxMenuItem[];
}

/**
 * 邮箱工作台的全部状态与动作（账号树 / 会话列表 / 正文 / 同步 / AI 排程）。
 *
 * ⚠️ effect 顺序即语义，勿调换：
 *   1) 打开面板 → 加载账号 + 会话自愈（healThreads，老数据 thread_id 为空）
 *   2) 首次拿到账号 → 自动选中收件箱
 *   3) 文件夹 / 搜索变化 → 重新加载第一页
 *   调换会复现"面板显示 N 个会话、右栏空白"的历史故障。
 */
export function useMailWorkspace() {
  // 可见性 = 当前停在邮箱页（用 appView 判断；mailStore.open 不再当开关）
  const open = useUiStore((s) => s.appView === "mail");
  const unreadTotal = useMailStore((s) => s.unreadTotal);
  const version = useMailStore((s) => s.version);
  const watch = useMailStore((s) => s.watch);

  /* ---------- 界面态（busy / 提示 / 菜单 / 弹窗，见 useMailUi） ---------- */
  const {
    busy,
    progress,
    setProgress,
    tip,
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
  } = useMailUi();

  /* ---------- 账号树（含"打开即自愈"与自动选中收件箱，见 useMailAccounts） ---------- */
  const {
    accounts,
    folders,
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
  } = useMailAccounts({ flash, setReloadKey });

  const [threads, setThreads] = useState<MailThread[]>([]);
  const [threadTotal, setThreadTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [thread, setThread] = useState<MailThread | null>(null);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showImages, setShowImages] = useState<Record<string, boolean>>({});

  /** 选中的文件夹变了就重新拉会话 */
  const loadThreads = useCallback(
    async (opts: { folderId: string; page: number; append: boolean; query: string; unreadOnly: boolean }) => {
      setLoadingThreads(true);
      try {
        const res = await listThreads({
          folderId: opts.folderId,
          keyword: opts.query || undefined,
          unreadOnly: opts.unreadOnly,
          limit: PAGE_SIZE,
          offset: (opts.page - 1) * PAGE_SIZE,
        });
        setThreadTotal(res.total);
        setThreads((prev) => (opts.append ? [...prev, ...res.rows] : res.rows));
        setPage(opts.page);
        void countMissingBodies(opts.folderId).then(setMissing);
      } catch (e) {
        flash("err", errText(e));
      } finally {
        setLoadingThreads(false);
      }
    },
    [flash],
  );

  // 文件夹 / 搜索变化 → 重新加载第一页
  useEffect(() => {
    if (!open || !activeFolderId) return;
    void loadThreads({ folderId: activeFolderId, page: 1, append: false, query, unreadOnly });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeFolderId, query, unreadOnly, reloadKey]);

  // 打开面板时刷新"待确认候选"数量
  useEffect(() => {
    if (!open) return;
    void pendingCount().then(setPending).catch(() => undefined);
  }, [open, version]);

  // 文件夹切换后统计"乱码正文"（要读正文，只在切换文件夹时做）
  useEffect(() => {
    if (!open || !activeFolderId) return;
    void countBadBodies(activeFolderId).then(setBadBodies).catch(() => undefined);
  }, [open, activeFolderId, reloadKey]);

  // 搜索防抖
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(keyword.trim()), 300);
    return () => window.clearTimeout(t);
  }, [keyword]);

  const loadMore = useCallback(() => {
    if (!activeFolderId || loadingThreads || threads.length >= threadTotal) return;
    void loadThreads({ folderId: activeFolderId, page: page + 1, append: true, query, unreadOnly });
  }, [activeFolderId, loadingThreads, threads.length, threadTotal, page, query, unreadOnly, loadThreads]);

  /* ---------- 打开会话 ---------- */

  const openThread = useCallback(
    async (t: MailThread) => {
      setThread(t);
      setLoadingMsgs(true);
      setMessages([]);
      try {
        const list = await listThreadMessages(t.threadId);
        setMessages(list);
        // 打开即已读（与主流客户端一致）；工具栏可再「标记未读」
        const unread = list.filter((m) => !m.seen);
        if (unread.length > 0 && activeAccount && activeFolder) {
          const uids = unread.map((m) => m.uid);
          try {
            await setFlagsRemote(activeAccount.id, activeFolder.raw, uids, { seen: true });
          } catch (e) {
            console.warn("[mail] 标记已读失败（仅本地生效）", e);
          }
          await applyFlagsLocal(activeFolder.id, uids, { seen: true });
          setThreads((prev) =>
            prev.map((x) => (x.threadId === t.threadId ? { ...x, unreadCount: 0 } : x)),
          );
          setMessages((prev) => prev.map((m) => ({ ...m, seen: true })));
          const counts = await folderCounts(activeFolder.id);
          await updateFolderStats(activeFolder.id, { unread: counts.unread, total: counts.total });
          await loadAccounts();
        }
      } catch (e) {
        flash("err", errText(e));
      } finally {
        setLoadingMsgs(false);
      }
    },
    [activeAccount, activeFolder, flash, loadAccounts],
  );

  /** 按会话 id 重新打开（阅读界面里下载了正文/改了状态后刷新用） */
  const openThreadById = useCallback(
    async (threadId: string) => {
      if (!threadId || !activeFolderId) return;
      try {
        setMessages(await listThreadMessages(threadId));
      } catch (e) {
        flash("err", errText(e));
      }
    },
    [activeFolderId, flash],
  );

  /* ---------- 同步 ---------- */

  const syncOne = useCallback(
    async (accountId: string, folder?: MailFolder) => {
      await run(
        accountId,
        async () => {
          let added = 0;
          if (folder) {
            const res = await syncFolder(accountId, folder.id, (p) => setProgress(p.message));
            added = res.added;
          } else {
            const res = await syncAllAccounts((_id, name, p) =>
              setProgress(name && p.message ? `${name}：${p.message}` : p.message),
            );
            if (res.failed.length > 0) throw new Error(`${res.failed[0].account}：${res.failed[0].error}`);
          }
          await loadAccounts();
          if (activeFolderId) {
            await loadThreads({ folderId: activeFolderId, page: 1, append: false, query, unreadOnly });
          }
          flash("ok", added > 0 ? `同步完成，新增 ${added} 封` : "已是最新");
        },
        { progress: true },
      );
    },
    [activeFolderId, loadAccounts, loadThreads, query, unreadOnly, flash, run],
  );

  const syncAll = useCallback(async () => {
    if (accounts.length === 0) return;
    await run(
      "all",
      async () => {
        const res = await syncAllAccounts((_id, name, p) =>
          setProgress(name && p.message ? `${name}：${p.message}` : p.message),
        );
        await loadAccounts();
        if (activeFolderId) {
          await loadThreads({ folderId: activeFolderId, page: 1, append: false, query, unreadOnly });
        }
        flash(
          res.failed.length > 0 ? "err" : "ok",
          res.failed.length > 0
            ? `${res.ok} 个账号完成，${res.failed.length} 个失败：${res.failed[0].account}（${res.failed[0].error}）`
            : `全部同步完成（${res.ok} 个账号）`,
        );
      },
      { progress: true },
    );
  }, [accounts.length, activeFolderId, loadAccounts, loadThreads, query, unreadOnly, flash, run]);

  const refreshList = useCallback(async () => {
    if (activeFolderId) {
      await loadThreads({ folderId: activeFolderId, page: 1, append: false, query, unreadOnly });
    }
  }, [activeFolderId, loadThreads, query, unreadOnly]);

  /* ---------- 会话操作 ---------- */

  /** 对会话里的邮件打标记（走服务器 + 回写本地） */
  const flagThread = useCallback(
    async (t: MailThread, flags: { seen?: boolean; flagged?: boolean }) => {
      if (!activeAccount || !activeFolder) return;
      await run("action", async () => {
        const list = await listThreadMessages(t.threadId);
        const uids = list.map((m) => m.uid);
        if (uids.length === 0) return;
        await setFlagsRemote(activeAccount.id, activeFolder.raw, uids, flags);
        await applyFlagsLocal(activeFolder.id, uids, flags);
        const counts = await folderCounts(activeFolder.id);
        await updateFolderStats(activeFolder.id, { unread: counts.unread, total: counts.total });
        await refreshList();
        await loadAccounts();
        if (thread?.threadId === t.threadId) {
          if (flags.seen !== undefined)
            setMessages((prev) => prev.map((m) => ({ ...m, seen: flags.seen! })));
          if (flags.flagged !== undefined)
            setMessages((prev) => prev.map((m) => ({ ...m, flagged: flags.flagged! })));
        }
        flash(
          "ok",
          flags.seen === false
            ? "已标记未读"
            : flags.flagged === true
              ? "已加星标"
              : flags.flagged === false
                ? "已取消星标"
                : "已标记已读",
        );
      });
    },
    [activeAccount, activeFolder, refreshList, loadAccounts, thread, flash],
  );

  const removeThread = useCallback(
    async (t: MailThread) => {
      if (!activeAccount || !activeFolder) return;
      await run("action", async () => {
        const list = await listThreadMessages(t.threadId);
        const uids = list.map((m) => m.uid);
        const trash = (folders[activeAccount.id] ?? []).find((f) => f.special === "trash");
        const isTrash = activeFolder.special === "trash";
        if (isTrash || !trash) {
          // 已在垃圾箱（或没有垃圾箱）：直接标记删除并清空
          await moveRemote(activeAccount.id, activeFolder.raw, uids, activeFolder.raw);
        } else {
          await moveRemote(activeAccount.id, activeFolder.raw, uids, trash.raw);
        }
        await removeMessagesLocal(activeFolder.id, uids);
        if (thread?.threadId === t.threadId) {
          setThread(null);
          setMessages([]);
        }
        await refreshList();
        await loadAccounts();
        flash("ok", isTrash ? `已删除 ${uids.length} 封` : `已移入${trash?.name ?? "垃圾箱"}`);
      });
    },
    [activeAccount, activeFolder, folders, refreshList, loadAccounts, thread, flash],
  );

  const moveThread = useCallback(
    async (t: MailThread, target: MailFolder) => {
      if (!activeAccount || !activeFolder) return;
      setMovePicker(null);
      await run("action", async () => {
        const list = await listThreadMessages(t.threadId);
        const uids = list.map((m) => m.uid);
        await moveRemote(activeAccount.id, activeFolder.raw, uids, target.raw);
        await removeMessagesLocal(activeFolder.id, uids);
        if (thread?.threadId === t.threadId) {
          setThread(null);
          setMessages([]);
        }
        await refreshList();
        flash("ok", `已移动到「${target.name}」`);
      });
    },
    [activeAccount, activeFolder, refreshList, thread, flash],
  );

  /** 重算当前文件夹的会话（老数据缺 References 时先重拉邮件头） */
  const organize = useCallback(
    async (refetchHeaders: boolean) => {
      if (!activeAccount || !activeFolder) return;
      await run(
        "organize",
        async () => {
          let changed = 0;
          if (refetchHeaders) {
            changed = await rebuildThreads(activeAccount.id, activeFolder.id, (p) => setProgress(p.message));
          } else {
            setProgress("重新计算会话…");
            changed = await healThreads();
          }
          setReloadKey((k) => k + 1);
          await refreshList();
          setThread(null);
          setMessages([]);
          flash("ok", `已整理会话（调整了 ${changed} 封邮件的归属）`);
        },
        { progress: true },
      );
    },
    [activeAccount, activeFolder, refreshList, flash, run],
  );

  /** 右栏空白的兜底：重算会话后按本地邮件 id 找回它所属的新会话 */
  const recoverThread = useCallback(async () => {
    if (!thread || !activeFolderId) return;
    await run("organize", async () => {
      await healThreads();
      const tid = await threadIdOfMessage(thread.latestMessageId);
      const res = await listThreads({ folderId: activeFolderId, limit: 200 });
      const found = tid ? res.rows.find((t) => t.threadId === tid) : null;
      if (found) {
        await openThread(found);
        flash("ok", "已重新整理会话");
      } else {
        setReloadKey((k) => k + 1);
        setThread(null);
        setMessages([]);
        flash("ok", "已重新整理会话，请再点一次该会话");
      }
    });
  }, [thread, activeFolderId, openThread, flash, run]);

  /* ---------- AI 排程 ---------- */

  /** AI 扫描当前文件夹里还没分析过的邮件（先给成本预估，用户点了才发） */
  const askScan = useCallback(async () => {
    if (!activeFolder) return;
    await run("aiscan", async () => {
      const est = await estimateScan(activeFolder.id, 15);
      if (est.messages === 0) {
        flash(
          "ok",
          est.skippedNoBody > 0
            ? `没有可识别的邮件：另有 ${est.skippedNoBody} 封还没缓存正文，先点「补正文」`
            : "这个文件夹里没有被分析过的新邮件",
        );
        return;
      }
      setScanAsk(est);
    });
  }, [activeFolder, flash, run]);

  const runScan = useCallback(async () => {
    if (!activeFolder) return;
    setScanAsk(null);
    await run(
      "aiscan",
      async () => {
        setProgress("AI 正在读邮件…");
        const res = await scanFolder(activeFolder.id, 15, (t) => setProgress(t));
        setPending(await pendingCount());
        if (res.candidates > 0) {
          setScheduleOpen(true);
          flash("ok", `识别出 ${res.candidates} 条候选，请逐条确认后再写日历`);
        } else {
          flash("ok", `扫描了 ${res.scanned} 封，没有发现带明确时间的安排`);
        }
      },
      { progress: true },
    );
  }, [activeFolder, flash, run]);

  /** AI 识别当前会话里的面试/笔试（正文没缓存会自动先取） */
  const runThreadAi = useCallback(async () => {
    if (!thread) return;
    await run(
      "aiscan",
      async () => {
        setProgress("AI 正在读这场会话…");
        const res = await extractThread(thread.threadId, (t) => setProgress(t));
        setPending(await pendingCount());
        if (res.candidates > 0) {
          setScheduleOpen(true);
          flash("ok", `识别出 ${res.candidates} 条候选`);
        } else {
          flash("ok", res.scanned > 0 ? "这场会话里没有带明确时间的安排" : "这场会话没有可读正文");
        }
      },
      { progress: true },
    );
  }, [thread, flash, run]);

  /** 补正文 + 顺带修复旧版存下的乱码正文 */
  const fillBodies = useCallback(async () => {
    if (!activeAccount || !activeFolder) return;
    await run("prefetch", async () => {
      const n = await prefetchBodies(activeAccount.id, activeFolder.id, 20);
      const fixed = await repairBodies(activeAccount.id, activeFolder.id, 10);
      const left = await countMissingBodies(activeFolder.id);
      const bad = await countBadBodies(activeFolder.id);
      setMissing(left);
      setBadBodies(bad);
      await refreshList();
      const parts = [
        n > 0 ? `补齐 ${n} 封正文` : "正文都已缓存",
        fixed > 0 ? `修复 ${fixed} 封乱码正文` : "",
        left > 0 ? `还剩 ${left} 封未缓存` : "",
        bad > 0 ? `还有 ${bad} 封乱码待修复` : "",
      ].filter(Boolean);
      flash("ok", parts.join("；"));
    });
  }, [activeAccount, activeFolder, refreshList, flash, run]);

  /* ---------- 右键菜单 ---------- */

  const threadMenu = (e: ReactMouseEvent, t: MailThread, icons: ThreadMenuIcons) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: t.unreadCount > 0 ? "标记已读" : "标记未读",
          icon: icons.mailOpen,
          onSelect: () => void flagThread(t, { seen: t.unreadCount > 0 }),
        },
        {
          label: t.flagged ? "取消星标" : "加星标",
          icon: icons.star,
          onSelect: () => void flagThread(t, { flagged: !t.flagged }),
        },
        {
          label: "移动到…",
          icon: icons.folder,
          onSelect: () => setMovePicker(t),
        },
        {
          label: "删除会话",
          icon: icons.trash,
          danger: true,
          confirmLabel: "确认删除？",
          onSelect: () => void removeThread(t),
        },
      ],
    });
  };

  const accountMenu = (e: ReactMouseEvent, a: MailAccount, icons: AccountMenuIcons) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "同步此邮箱", icon: icons.sync, onSelect: () => void syncOne(a.id) },
        {
          label: a.notify ? "关闭新邮件提醒" : "开启新邮件提醒",
          icon: a.notify ? icons.bellOff : icons.bell,
          onSelect: () =>
            void updateAccount(a.id, { notify: !a.notify })
              .then(() => applyMailWatch())
              .then(() => loadAccounts()),
        },
        {
          label: "重启实时接收",
          icon: icons.radar,
          onSelect: () =>
            void applyMailWatch().then((started) =>
              flash("ok", started.length > 0 ? `已重启 ${started.length} 个账号的实时接收` : "实时接收已在运行"),
            ),
        },
        { label: "编辑", icon: icons.edit, onSelect: () => setDialog({ open: true, editing: a }) },
        {
          label: "删除账号（含本地邮件）",
          icon: icons.trash,
          danger: true,
          confirmLabel: "确认删除？",
          onSelect: () => {
            void deleteAccount(a.id)
              .then(async () => {
                setActiveAccountId(null);
                setActiveFolderId(null);
                setThread(null);
                setMessages([]);
                await loadAccounts();
                flash("ok", `已删除 ${a.email}`);
              })
              .catch((err) => flash("err", errText(err)));
          },
        },
      ],
    });
  };

  const moveTargets = useMemo(() => {
    if (!activeAccount) return [];
    return (folders[activeAccount.id] ?? []).filter((f) => f.selectable && f.id !== activeFolderId);
  }, [activeAccount, folders, activeFolderId]);

  return {
    // 可见性与外部状态
    open,
    unreadTotal,
    version,
    watch,
    // 账号树
    accounts,
    folders,
    expanded,
    setExpanded,
    activeAccountId,
    setActiveAccountId,
    activeFolderId,
    setActiveFolderId,
    activeAccount,
    activeFolder,
    loadAccounts,
    notifyAccounts,
    // 会话列表
    threads,
    threadTotal,
    page,
    loadingThreads,
    keyword,
    setKeyword,
    query,
    setQuery,
    unreadOnly,
    setUnreadOnly,
    loadMore,
    refreshList,
    listRef,
    canLoadMore: threads.length < threadTotal,
    // 会话内容
    thread,
    setThread,
    messages,
    setMessages,
    loadingMsgs,
    openThread,
    openThreadById,
    showImages,
    setShowImages,
    readerIndex,
    setReaderIndex,
    // 同步与批量
    busy,
    progress,
    tip,
    flash,
    syncOne,
    syncAll,
    fillBodies,
    missing,
    badBodies,
    reloadKey,
    setReloadKey,
    // 会话操作
    flagThread,
    removeThread,
    moveThread,
    movePicker,
    setMovePicker,
    moveTargets,
    organize,
    recoverThread,
    // AI 排程
    askScan,
    runScan,
    runThreadAi,
    scanAsk,
    setScanAsk,
    scheduleOpen,
    setScheduleOpen,
    pending,
    setPending,
    // 菜单与弹窗
    ctx,
    setCtx,
    dialog,
    setDialog,
    threadMenu,
    accountMenu,
  };
}

/** 右键菜单图标由调用方注入，避免 hook 里 import lucide 图标（纯逻辑不依赖视图）。 */
export interface ThreadMenuIcons {
  mailOpen: React.ReactNode;
  star: React.ReactNode;
  folder: React.ReactNode;
  trash: React.ReactNode;
}

export interface AccountMenuIcons {
  sync: React.ReactNode;
  bell: React.ReactNode;
  bellOff: React.ReactNode;
  radar: React.ReactNode;
  edit: React.ReactNode;
  trash: React.ReactNode;
}
