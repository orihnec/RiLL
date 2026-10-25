import type { MouseEvent as ReactMouseEvent } from "react";
import { ArrowDown, FileText, RotateCcw, Sparkles } from "lucide-react";
import { Markdown } from "../../../components/markdown";
import type { ChatMsg } from "../../../kernel/agent/types";
import { useChatStore } from "../../../stores/chatStore";
import { cn } from "../../../lib/utils";
import { useStickToBottom } from "../hooks/useStickToBottom";
import { ReasoningRow } from "./ReasoningRow";
import { ToolRow } from "./ToolRow";
import { TurnStatus } from "./TurnStatus";

/**
 * 消息列表：用户气泡 / 助手正文（思考 → 工具 → 正文）+ 回退操作 + 回到底部。
 */
export function MessageList({
  messages,
  status,
  error,
  configured,
  rollbackConfirm,
  onRollback,
  onMsgContextMenu,
  active = true,
}: {
  messages: ChatMsg[];
  status: string;
  error: string | null;
  configured: boolean;
  rollbackConfirm: string | null;
  onRollback: (id: string) => void;
  onMsgContextMenu: (e: ReactMouseEvent, m: ChatMsg) => void;
  /** 卡片/页面是否可见（决定自动滚动是否生效） */
  active?: boolean;
}) {
  const open = active;
  const view = useChatStore((s) => s.view);
  const send = useChatStore((s) => s.send);
  const { listRef, atBottom, onScroll, jumpToBottom } = useStickToBottom({ messages, status, open, view });

  const lastMsg = messages[messages.length - 1];
  // 等待首 token：最后一条是用户消息，或 assistant 消息还没任何内容
  const waiting =
    status === "streaming" &&
    (lastMsg?.role === "user" ||
      (lastMsg?.role === "assistant" &&
        !lastMsg.content &&
        !lastMsg.reasoning &&
        lastMsg.toolCalls.length === 0));

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex h-full flex-col gap-2 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && (
          <div className="mx-auto mt-16 flex w-full max-w-xl flex-col items-center gap-3 text-center">
            <Sparkles className="size-7 text-indigo-300/50" />
            <p className="text-[13px] text-muted-foreground/70">
              说一句话就能安排日程、查校招岗位、读邮箱里的面试通知
            </p>
            <div className="mt-1 grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2">
              {[
                "明天下午 3 点和老王开会 1 小时",
                "这周还有什么安排？",
                "有哪些还能投的校招岗位",
                "最近邮箱里有什么面试安排",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-white/8 bg-white/3 px-2.5 py-2 text-left text-[11.5px] text-foreground/70 transition hover:border-indigo-400/30 hover:bg-white/6 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
            {!configured && (
              <p className="text-[10px] text-muted-foreground/45">
                当前为演示模式（不调用 LLM），在设置里配置 API 后获得完整能力
              </p>
            )}
          </div>
        )}

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        {messages.map((m, i) => {
          const isLast = m.id === messages[messages.length - 1]?.id;
          const streamingThis = isLast && status === "streaming";
          // 同一角色连续消息收紧间距，换角色时拉开
          const sameAsPrev = i > 0 && messages[i - 1].role === m.role;
          return (
            <div
              key={m.id}
              id={`chat-msg-${m.id}`}
              onContextMenu={(e) => onMsgContextMenu(e, m)}
              className={cn(
                "group relative flex flex-col",
                m.role === "user" ? "items-end" : "items-start",
                sameAsPrev ? "mt-[-6px]" : "mt-1",
              )}
            >
              {m.role === "user" ? (
                <>
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                      {m.attachments.map((a, i) => (
                        <span
                          key={i}
                          className="flex max-w-[240px] items-center gap-1 rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] text-foreground/65"
                          title={`${a.name}（${a.text.length} 字符）`}
                        >
                          <FileText className="size-3 shrink-0" />
                          <span className="truncate">{a.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-500/25 px-3 py-2 text-sm text-indigo-100">
                    {m.content}
                  </div>
                </>
              ) : (
                <div className="flex w-full flex-col gap-1">
                  {m.reasoning && (
                    <ReasoningRow text={m.reasoning} running={streamingThis && !m.content} />
                  )}
                  {/* 转录顺序：思考 → 工具（收成一组，左侧细线） → 正文 */}
                  {m.toolCalls.length > 0 && (
                    <div className="ml-0.5 flex flex-col border-l border-white/10 pl-2">
                      {m.toolCalls.map((tc) => (
                        <ToolRow key={tc.id} tc={tc} />
                      ))}
                    </div>
                  )}
                  {m.content && (
                    <div className="text-[13px] leading-relaxed text-foreground/90">
                      <Markdown text={m.content} />
                      {streamingThis && (
                        <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-indigo-300 align-middle" />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 回退操作：hover 才出现的小图标（复制走右键菜单） */}
              <button
                onClick={() => onRollback(m.id)}
                className={cn(
                  "mt-1 flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-[9px] opacity-0 transition group-hover:opacity-100",
                  rollbackConfirm === m.id
                    ? "bg-red-500/25 text-red-200 opacity-100"
                    : "text-muted-foreground/40 hover:bg-white/8 hover:text-muted-foreground",
                )}
                title="回退到此（丢弃之后的内容）"
              >
                <RotateCcw className="size-2.5" />
                {rollbackConfirm === m.id ? "确认回退？" : "回退到此"}
              </button>
            </div>
          );
        })}

          {/* 等待首个 token：和助手内容同列、同缩进（不要甩到最左边） */}
          {waiting && (
            <div className="ml-0.5 flex items-center gap-1.5 border-l border-white/10 py-1 pl-2 text-[11px] text-muted-foreground/60">
              <TurnStatus />
            </div>
          )}
          {error && <p className="pl-2 text-[11px] text-red-400">{error}</p>}
        </div>
      </div>

      {/* 向上翻阅后：回到底部悬浮按钮 */}
      {!atBottom && (
        <button
          onClick={jumpToBottom}
          title="回到底部"
          className="absolute bottom-2.5 left-1/2 z-10 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-white/8 text-muted-foreground shadow-lg transition hover:bg-white/15 hover:text-foreground"
        >
          <ArrowDown className="size-3.5" />
        </button>
      )}
    </div>
  );
}
