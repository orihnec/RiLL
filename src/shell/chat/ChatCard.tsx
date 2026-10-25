import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { motion } from "framer-motion";
import { Copy, History, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ContextMenu, type CtxMenuItem } from "../../components/ui/ContextMenu";
import type { ChatMsg } from "../../kernel/agent/types";
import { cn } from "../../lib/utils";
import { useTwoStepConfirm } from "../../lib/useTwoStepConfirm";
import { copyText } from "./format";
import { HistoryPanel } from "./components/HistoryPanel";
import { MessageList } from "./components/MessageList";
import { Composer } from "./components/Composer";

/**
 * 侧边 AI **卡片**（浮层抽屉）：随手问一句，不离开当前页面。
 *
 * 和「AI 助手」页面共用同一份会话状态（chatStore）：
 * 页面用于长对话 / 翻历史，卡片用于"在日历上顺手问一句"。
 */
export function ChatCard() {
  const open = useChatStore((s) => s.open);
  const setOpen = useChatStore((s) => s.setOpen);
  const view = useChatStore((s) => s.view);
  const setView = useChatStore((s) => s.setView);
  const sessionId = useChatStore((s) => s.sessionId);
  const sessions = useChatStore((s) => s.sessions);
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const error = useChatStore((s) => s.error);
  const newChat = useChatStore((s) => s.newChat);
  const rollbackTo = useChatStore((s) => s.rollbackTo);
  const init = useChatStore((s) => s.init);
  const providers = useSettingsStore((s) => s.providers);
  const activeProviderId = useSettingsStore((s) => s.activeProviderId);

  const rollback = useTwoStepConfirm();
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);

  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? providers[0] ?? null;
  const configured =
    !!activeProvider &&
    activeProvider.apiKeySet &&
    activeProvider.baseUrl.trim() !== "" &&
    activeProvider.chatModel.trim() !== "";
  const currentTitle = sessions.find((s) => s.id === sessionId)?.title ?? "新对话";

  useEffect(() => {
    if (open && !sessionId) void init();
  }, [open, sessionId, init]);

  const onRollback = (id: string) => {
    if (rollback.armed(id)) void rollbackTo(id);
  };

  const msgMenu = (e: ReactMouseEvent, m: ChatMsg) => {
    e.preventDefault();
    e.stopPropagation();
    const isFirst = messages.findIndex((x) => x.id === m.id) <= 0;
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: m.content ? "复制文本" : "复制（无文本）",
          icon: <Copy className="size-3.5" />,
          disabled: !m.content,
          onSelect: () => void copyText(m.content),
        },
        {
          label: "回退到此",
          icon: <RotateCcw className="size-3.5" />,
          confirmLabel: "确认回退？",
          disabled: status === "streaming" || isFirst,
          onSelect: () => void rollbackTo(m.id),
        },
      ],
    });
  };

  return (
    <motion.aside
      initial={false}
      animate={{ x: open ? 0 : 380, opacity: open ? 1 : 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 32 }}
      style={{ pointerEvents: open ? "auto" : "none" }}
      className="glass-float absolute inset-y-2 right-2 z-30 flex w-[360px] flex-col overflow-hidden rounded-3xl"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-white/6 px-3 py-2">
        <Sparkles className="size-4 shrink-0 text-indigo-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">
            {view === "history" ? "历史记录" : currentTitle}
          </div>
          <div className="truncate text-[10px] text-muted-foreground/60">
            {view === "history"
              ? "搜索回忆 · 切换 · 删除"
              : configured
                ? (activeProvider?.chatModel ?? "已连接")
                : activeProvider
                  ? "未选择模型"
                  : "演示模式"}
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
          title="收起"
          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {view === "history" ? (
        <HistoryPanel />
      ) : (
        <>
          <MessageList
            active={open}
            messages={messages}
            status={status}
            error={error}
            configured={configured}
            rollbackConfirm={rollback.pendingKey}
            onRollback={onRollback}
            onMsgContextMenu={msgMenu}
          />
          <Composer open={open} configured={configured} />
        </>
      )}

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </motion.aside>
  );
}
