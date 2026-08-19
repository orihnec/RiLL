import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  AlertCircle,
  CheckCircle2,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ToolCallView } from "../../kernel/agent/types";
import { cn } from "../../lib/utils";

function ToolChip({ tc }: { tc: ToolCallView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-[92%] overflow-hidden rounded-xl border border-white/8 bg-white/4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition hover:bg-white/4"
      >
        {tc.status === "running" ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-indigo-300" />
        ) : tc.status === "done" ? (
          <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
        ) : (
          <AlertCircle className="size-3 shrink-0 text-red-400" />
        )}
        <span className="font-mono text-indigo-200">{tc.name}</span>
        <span className="ml-auto shrink-0 text-muted-foreground/60">
          {tc.status === "running" ? "执行中…" : tc.status === "done" ? "完成" : "失败"}
        </span>
      </button>
      {open && (
        <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap border-t border-white/6 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          {JSON.stringify(tc.args, null, 1)}
          {tc.result ? `\n→ ${tc.result}` : ""}
        </pre>
      )}
    </div>
  );
}

/** 历史记录视图：会话列表 + 搜索回忆 + 删除。 */
function HistoryPanel() {
  const sessions = useChatStore((s) => s.sessions);
  const sessionId = useChatStore((s) => s.sessionId);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const searchHits = useChatStore((s) => s.searchHits);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const search = useChatStore((s) => s.search);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const setView = useChatStore((s) => s.setView);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const openHit = (sessionId: string, msgId: string) => {
    void switchSession(sessionId).then(() => {
      setTimeout(() => {
        document.getElementById(`chat-msg-${msgId}`)?.scrollIntoView({ block: "center" });
      }, 150);
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
                  <span className={cn("size-1.5 rounded-full", h.role === "user" ? "bg-indigo-400" : "bg-emerald-400")} />
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
                  if (confirmDel === s.id) {
                    void deleteSession(s.id);
                    setConfirmDel(null);
                  } else {
                    setConfirmDel(s.id);
                  }
                }}
                className={cn(
                  "shrink-0 rounded-lg p-1.5 transition",
                  confirmDel === s.id
                    ? "bg-red-500/20 text-red-300"
                    : "text-muted-foreground/50 hover:bg-white/8 hover:text-red-300",
                )}
                title="删除会话"
              >
                {confirmDel === s.id ? <span className="px-0.5 text-[10px]">确认？</span> : <Trash2 className="size-3.5" />}
              </button>
            </div>
          ))
        )}
      </div>

      <button
        onClick={() => setView("chat")}
        className="rounded-xl border border-white/8 bg-white/4 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
      >
        ← 返回当前对话
      </button>
    </div>
  );
}

/** 右侧 AI 对话面板：当前对话 / 历史记录双视图 + 消息回退。 */
export function ChatDock() {
  const open = useChatStore((s) => s.open);
  const setOpen = useChatStore((s) => s.setOpen);
  const view = useChatStore((s) => s.view);
  const setView = useChatStore((s) => s.setView);
  const sessionId = useChatStore((s) => s.sessionId);
  const sessions = useChatStore((s) => s.sessions);
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const error = useChatStore((s) => s.error);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const newChat = useChatStore((s) => s.newChat);
  const rollbackTo = useChatStore((s) => s.rollbackTo);
  const configured = useSettingsStore(
    (s) => s.llm.apiKeySet && s.llm.baseUrl.trim() !== "" && s.llm.chatModel.trim() !== "",
  );
  const [input, setInput] = useState("");
  const [rollbackConfirm, setRollbackConfirm] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const currentTitle = sessions.find((s) => s.id === sessionId)?.title ?? "新对话";

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status, open, view]);

  const submit = () => {
    const t = input.trim();
    if (!t || status === "streaming") return;
    setInput("");
    send(t);
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? 360 : 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 32 }}
      className="shrink-0 overflow-hidden"
    >
      <div className="h-full w-[360px] p-3 pl-0">
        <div className="glass flex h-full flex-col overflow-hidden rounded-3xl">
          {/* 头部 */}
          <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2.5">
            <Sparkles className="size-4 shrink-0 text-indigo-300" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">
                {view === "history" ? "历史记录" : currentTitle}
              </div>
              <div className="text-[10px] text-muted-foreground/60">
                {view === "history" ? "搜索回忆 · 切换 · 删除" : configured ? "已连接" : "演示模式"}
              </div>
            </div>
            <button
              onClick={() => setView(view === "chat" ? "history" : "chat")}
              title="历史记录"
              className={cn(
                "rounded-lg p-1.5 transition",
                view === "history"
                  ? "bg-indigo-400/15 text-indigo-200"
                  : "text-muted-foreground hover:bg-white/8 hover:text-foreground",
              )}
            >
              <History className="size-3.5" />
            </button>
            <button
              onClick={() => void newChat()}
              title="新对话"
              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {view === "history" ? (
            <HistoryPanel />
          ) : (
            <>
              {/* 消息列表 */}
              <div
                ref={listRef}
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
              >
                {messages.length === 0 && (
                  <div className="mt-8 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground/70">
                    <Sparkles className="size-6 text-indigo-300/60" />
                    <p>
                      试试：
                      <br />
                      「明天下午 3 点和老王开会 1 小时」
                      <br />
                      「这周有什么安排？」
                    </p>
                    {!configured && (
                      <p className="text-[10px] text-muted-foreground/50">
                        当前为演示模式（不调用 LLM），在设置中配置 API 后获得完整能力
                      </p>
                    )}
                  </div>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    id={`chat-msg-${m.id}`}
                    className={cn(
                      "group relative flex flex-col",
                      m.role === "user" ? "items-end" : "items-start",
                    )}
                  >
                    <button
                      onClick={() => {
                        if (rollbackConfirm === m.id) {
                          setRollbackConfirm(null);
                          void rollbackTo(m.id);
                        } else {
                          setRollbackConfirm(m.id);
                        }
                      }}
                      className={cn(
                        "absolute -top-1.5 right-0 z-10 hidden items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] transition group-hover:flex",
                        rollbackConfirm === m.id
                          ? "bg-red-500/25 text-red-200"
                          : "bg-white/8 text-muted-foreground hover:text-foreground",
                      )}
                      title="回退到此（丢弃之后的内容）"
                    >
                      <RotateCcw className="size-2.5" />
                      {rollbackConfirm === m.id ? "确认回退？" : "回退到此"}
                    </button>
                    {m.role === "user" ? (
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-500/25 px-3 py-2 text-sm text-indigo-100">
                        {m.content}
                      </div>
                    ) : (
                      <div className="flex w-full flex-col gap-1.5">
                        {m.reasoning && (
                          <div className="max-w-[92%] whitespace-pre-wrap text-[10px] italic leading-relaxed text-muted-foreground/45">
                            {m.reasoning.length > 500 ? `${m.reasoning.slice(0, 500)}…` : m.reasoning}
                          </div>
                        )}
                        {m.content && (
                          <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white/6 px-3 py-2 text-sm text-foreground/90">
                            {m.content}
                          </div>
                        )}
                        {m.toolCalls.map((tc) => (
                          <ToolChip key={tc.id} tc={tc} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {status === "streaming" &&
                  (() => {
                    const last = messages[messages.length - 1];
                    const waitingAssistant = last?.role === "user";
                    // 推理模型（如 deepseek-v4-flash）先输出 reasoning、后输出文本
                    const reasoning =
                      last?.role === "assistant" &&
                      last.content === "" &&
                      last.toolCalls.length === 0;
                    return waitingAssistant || reasoning ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                        <Loader2 className="size-3 animate-spin" /> 思考中…
                      </div>
                    ) : null;
                  })()}
                {error && <p className="text-xs text-red-400">{error}</p>}
              </div>

              {/* 输入区 */}
              <div className="border-t border-white/6 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    rows={2}
                    placeholder={configured ? "问点什么，或直接说安排日程…" : "演示：创建 / 查询 / 找空闲"}
                    className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-indigo-400/40"
                  />
                  {status === "streaming" ? (
                    <button
                      onClick={stop}
                      title="停止"
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/15 text-red-300 transition hover:bg-red-500/25"
                    >
                      <Square className="size-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={submit}
                      disabled={!input.trim()}
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white transition hover:bg-indigo-400 disabled:opacity-40"
                      title="发送"
                    >
                      <Send className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
