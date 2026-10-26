import { Folder, Loader2, MailOpen, Star, Trash2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { avatarHue, fmtListDate, initials } from "../format";
import type { MailWorkspace } from "../hooks/useMailWorkspace";

/**
 * 第二栏：会话列表（一行一个会话，不是一封一行）。
 * 滚动到底自动加载下一页；会话级搜索命中任意一封即返回整条会话。
 */
export function ThreadList({ ws }: { ws: MailWorkspace }) {
  const {
    activeAccount,
    activeFolder,
    activeFolderId,
    threads,
    threadTotal,
    loadingThreads,
    canLoadMore,
    thread,
    query,
    unreadOnly,
    setKeyword,
    setQuery,
    setUnreadOnly,
    listRef,
    loadMore,
    openThread,
    threadMenu,
    syncOne,
  } = ws;

  return (
    <div className="flex w-[360px] shrink-0 flex-col border-r border-white/6">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/6 px-3 py-2">
        <span className="truncate text-ui-11 text-muted-foreground/70">
          {activeFolder
            ? `${activeAccount?.displayName || activeAccount?.email} · ${activeFolder.name}`
            : "选择一个文件夹"}
        </span>
        <span className="ml-auto shrink-0 text-ui-10 tabular-nums text-muted-foreground/45">
          {threadTotal} 个会话
        </span>
      </div>
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 260) loadMore();
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {!activeFolderId && (
          <p className="px-3 py-8 text-center text-ui-11 text-muted-foreground/50">
            左侧选一个文件夹开始
          </p>
        )}
        {activeFolderId && threads.length === 0 && !loadingThreads && (
          <p className="px-3 py-8 text-center text-ui-11 leading-relaxed text-muted-foreground/50">
            {query || unreadOnly ? "没有匹配的会话" : "这个文件夹还没有邮件"}
            <br />
            {!query && !unreadOnly && (
              <button
                className="mt-2 text-indigo-300 underline-offset-2 hover:underline"
                onClick={() => activeAccount && void syncOne(activeAccount.id, activeFolder ?? undefined)}
              >
                立即同步
              </button>
            )}
          </p>
        )}
        {threads.map((t) => {
          const active = thread?.threadId === t.threadId;
          const first = t.participants[0];
          const others = t.participants.length - 1;
          return (
            <div
              key={t.threadId}
              onClick={() => void openThread(t)}
              onContextMenu={(e) =>
                threadMenu(e, t, {
                  mailOpen: <MailOpen className="size-3.5" />,
                  star: <Star className="size-3.5" />,
                  folder: <Folder className="size-3.5" />,
                  trash: <Trash2 className="size-3.5" />,
                })
              }
              className={cn(
                "group cursor-pointer border-b border-white/4 px-3 py-2.5 transition",
                active ? "bg-indigo-400/10" : "hover:bg-white/4",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    t.unreadCount > 0 ? "bg-indigo-400" : "bg-transparent",
                  )}
                />
                <span
                  className="flex size-[2.75em] shrink-0 items-center justify-center whitespace-nowrap rounded-md text-ui-9 font-medium leading-none text-white/90"
                  style={{ background: `hsl(${avatarHue(first?.address ?? "?")} 45% 42%)` }}
                >
                  {initials(first?.name ?? "", first?.address ?? "")}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-ui-12",
                    t.unreadCount > 0 ? "font-semibold text-foreground" : "text-foreground/85",
                  )}
                >
                  {first?.name || first?.address || "(未知发件人)"}
                  {others > 0 && (
                    <span className="ml-1 text-ui-10 font-normal text-muted-foreground/50">
                      等 {t.participants.length} 人
                    </span>
                  )}
                </span>
                {t.flagged && <Star className="size-3 shrink-0 fill-amber-300 text-amber-300" />}
                <span className="shrink-0 text-ui-10 tabular-nums text-muted-foreground/50">
                  {fmtListDate(t.latestDate)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 pl-[26px]">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-ui-12",
                    t.unreadCount > 0 ? "text-foreground" : "text-muted-foreground/80",
                  )}
                >
                  {t.subject}
                </span>
                {t.messageCount > 1 && (
                  <span className="shrink-0 rounded-full bg-white/8 px-1.5 text-ui-10 tabular-nums text-muted-foreground/70">
                    {t.messageCount}
                  </span>
                )}
              </div>
              {t.snippet && (
                <p className="mt-0.5 truncate pl-[26px] text-ui-11 text-muted-foreground/45">
                  {t.snippet}
                </p>
              )}
            </div>
          );
        })}
        {loadingThreads && (
          <p className="flex items-center justify-center gap-1.5 py-4 text-ui-11 text-muted-foreground/50">
            <Loader2 className="size-3 animate-spin" />
            加载中…
          </p>
        )}
        {!loadingThreads && !canLoadMore && threads.length > 0 && (
          <p className="py-4 text-center text-ui-10 text-muted-foreground/35">已全部加载</p>
        )}
      </div>
      {(query || unreadOnly) && (
        <div className="shrink-0 border-t border-white/6 px-3 py-1.5">
          <button
            onClick={() => {
              setKeyword("");
              setQuery("");
              setUnreadOnly(false);
            }}
            className="text-ui-10 text-muted-foreground/60 hover:text-foreground"
          >
            清除筛选{query ? `（关键词：${query}）` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
