import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
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

/** 右侧 AI 对话面板（流式 + 工具调用状态）。 */
export function ChatDock() {
  const open = useChatStore((s) => s.open);
  const setOpen = useChatStore((s) => s.setOpen);
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const error = useChatStore((s) => s.error);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const clear = useChatStore((s) => s.clear);
  const configured = useSettingsStore(
    (s) => s.llm.apiKeySet && s.llm.baseUrl.trim() !== "" && s.llm.chatModel.trim() !== "",
  );
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status, open]);

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
          <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
            <Sparkles className="size-4 shrink-0 text-indigo-300" />
            <span className="text-sm font-semibold">AI 助手</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px]",
                configured
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-amber-400/10 text-amber-300",
              )}
            >
              {configured ? "已连接" : "演示模式"}
            </span>
            <div className="flex-1" />
            <button
              onClick={clear}
              title="清空会话"
              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
            >
              <Trash2 className="size-3.5" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

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
                  <br />
                  「帮我找 1 小时空闲」
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
                className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}
              >
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
                // 推理模型（如 deepseek-v4-flash）先输出 reasoning、后输出文本：
                // 空内容的 assistant 消息期间显示"思考中…"
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
        </div>
      </div>
    </motion.aside>
  );
}
