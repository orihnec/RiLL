import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Copy, MessageSquare, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ContextMenu, type CtxMenuItem } from "../../components/ui/ContextMenu";
import type { ChatMsg } from "../../kernel/agent/types";
import { useTwoStepConfirm } from "../../lib/useTwoStepConfirm";
import { copyText } from "./format";
import { HistoryPanel } from "./components/HistoryPanel";
import { MessageList } from "./components/MessageList";
import { Composer } from "./components/Composer";


/**
 * AI 助手（一级页面）：左会话列表 + 右对话流。
 *
 * 阅读宽度按聊天应用来（正文居中 `max-w-3xl`，不是抽屉那种 356px 窄条），
 * 左栏只在 ≥lg 显示，窄窗口优先给对话本身。
 */
export function ChatView() {
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
  const streaming = status === "streaming";

  useEffect(() => {
    void init();
  }, [init]);

  const onRollback = (id: string) => {
    if (rollback.armed(id)) void rollbackTo(id);
  };

  /** 消息右键：复制文本 / 回退到此（丢弃其后内容）。 */
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
          disabled: streaming || isFirst,
          onSelect: () => void rollbackTo(m.id),
        },
      ],
    });
  };

  return (
    <div className="glass flex min-h-0 flex-1 overflow-hidden rounded-3xl">
      {/* 左：会话列表 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/6 lg:flex">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-white/6 px-3 py-2">
          <MessageSquare className="size-3.5 text-muted-foreground/60" />
          <span className="text-[11px] font-semibold text-muted-foreground/70">会话</span>
          <span className="tabular-nums text-[10px] text-muted-foreground/40">{sessions.length}</span>
          <button
            onClick={() => void newChat()}
            title="新对话"
            className="ml-auto rounded-md p-1 text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <HistoryPanel />
      </aside>

      {/* 右：对话 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-white/6 px-4 py-2">
          <Sparkles className="size-4 shrink-0 text-indigo-300" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold">{currentTitle}</div>
            <div className="truncate text-[10px] text-muted-foreground/55">
              {configured ? (activeProvider?.chatModel ?? "已连接") : activeProvider ? "未选择模型" : "演示模式（未配置 API）"}
            </div>
          </div>
          <button
            onClick={() => void newChat()}
            title="新对话"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/8 hover:text-foreground lg:hidden"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        <MessageList
          messages={messages}
          status={status}
          error={error}
          configured={configured}
          rollbackConfirm={rollback.pendingKey}
          onRollback={onRollback}
          onMsgContextMenu={msgMenu}
        />

        {/* 输入区：和正文同宽，视觉上是一条"底部栏" */}
        <div className="mx-auto w-full max-w-3xl">
          <Composer open configured={configured} />
        </div>
      </div>

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
