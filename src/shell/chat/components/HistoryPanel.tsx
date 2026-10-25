import { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { MessageSquare, Search, Trash2 } from "lucide-react";
import { ContextMenu, type CtxMenuItem } from "../../../components/ui/ContextMenu";
import type { SessionInfo } from "../../../kernel/chat";
import { useChatStore } from "../../../stores/chatStore";
import { cn } from "../../../lib/utils";
import { useTwoStepConfirm } from "../../../lib/useTwoStepConfirm";

/** 历史记录视图：会话列表 + 关键词搜索回忆 + 删除。 */
export function HistoryPanel() {
  const sessions = useChatStore((s) => s.sessions);
  const sessionId = useChatStore((s) => s.sessionId);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const searchHits = useChatStore((s) => s.searchHits);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const search = useChatStore((s) => s.search);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const del = useTwoStepConfirm(0);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);

  const openHit = (sid: string, msgId: string) => {
    void switchSession(sid).then(() => {
      setTimeout(() => {
        document.getElementById(`chat-msg-${msgId}`)?.scrollIntoView({ block: "center" });
      }, 150);
    });
  };

  /** 历史会话右键：打开 / 删除（当前会话置灰）。 */
  const sessionMenu = (e: ReactMouseEvent, s: SessionInfo) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: s.id === sessionId ? "当前对话" : "打开会话",
          icon: <MessageSquare className="size-3.5" />,
          disabled: s.id === sessionId,
          onSelect: () => void switchSession(s.id),
        },
        {
          label: "删除会话",
          icon: <Trash2 className="size-3.5" />,
          danger: true,
          confirmLabel: "确认删除？",
          onSelect: () => void deleteSession(s.id),
        },
      ],
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-2.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground/60" />
        <input
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            void search(e.target.value);
          }}
          placeholder="搜索聊天记录，回忆之前的内容…"
          className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {searchQuery.trim() ? (
          searchHits === null ? (
            <p className="mt-6 text-center text-xs text-muted-foreground/60">输入关键词搜索…</p>
          ) : searchHits.length === 0 ? (
            <p className="mt-6 text-center text-xs text-muted-foreground/60">没有找到匹配的记录</p>
          ) : (
            searchHits.map((h) => (
              <button
                key={h.id}
                onClick={() => openHit(h.sessionId, h.id)}
                className="flex flex-col gap-0.5 rounded-xl border border-white/6 bg-white/3 px-2.5 py-2 text-left transition hover:bg-white/6"
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      h.role === "user" ? "bg-indigo-400" : "bg-emerald-400",
                    )}
                  />
                  <span className="max-w-[180px] truncate font-medium">{h.sessionTitle}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/50">
                    {formatDistanceToNow(h.created_at, { addSuffix: true, locale: zhCN })}
                  </span>
                </div>
                <div className="truncate pl-3 text-[11px] text-muted-foreground/75">{h.content}</div>
              </button>
            ))
          )
        ) : sessions.length === 0 ? (
          <p className="mt-6 text-center text-xs text-muted-foreground/60">还没有历史对话</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              onContextMenu={(e) => sessionMenu(e, s)}
              className="group flex items-center gap-2 rounded-xl border border-white/6 bg-white/3 px-2.5 py-2 transition hover:bg-white/6"
            >
              <button
                onClick={() => void switchSession(s.id)}
                className="min-w-0 flex-1 text-left"
                title="打开该会话"
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium">{s.title}</span>
                  {s.id === sessionId && (
                    <span className="shrink-0 rounded-full bg-indigo-400/15 px-1.5 py-px text-[9px] text-indigo-300">
                      当前
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground/60">
                  {s.message_count} 条 ·{" "}
                  {formatDistanceToNow(s.updated_at, { addSuffix: true, locale: zhCN })}
                </div>
              </button>
              <button
                onClick={() => {
                  if (del.armed(s.id)) void deleteSession(s.id);
                }}
                className={cn(
                  "shrink-0 rounded-lg p-1.5 transition",
                  del.pendingKey === s.id
                    ? "bg-red-500/20 text-red-300"
                    : "text-muted-foreground/50 hover:bg-white/8 hover:text-red-300",
                )}
                title="删除会话"
              >
                {del.pendingKey === s.id ? (
                  <span className="px-0.5 text-[10px]">确认？</span>
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            </div>
          ))
        )}
      </div>


      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
