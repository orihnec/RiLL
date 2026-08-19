import { create } from "zustand";
import type { ChatMsg, ToolCallView } from "../kernel/agent/types";
import { isLlmConfigured, runRealChat, abortRealChat } from "../kernel/agent/runtime";
import { runMockChat } from "../kernel/agent/mock";
import { saveChatMessage, loadRecentChatMessages } from "../kernel/chat";

interface ChatState {
  open: boolean;
  messages: ChatMsg[];
  status: "idle" | "streaming";
  error: string | null;
  setOpen: (open: boolean) => void;
  clear: () => void;
  /** 启动时恢复最近会话历史（来自 chat_messages 表） */
  init: () => Promise<void>;
  /** 中断当前流（真实 LLM abort / mock 取消令牌） */
  stop: () => void;
  /** 发送一条消息：已配置 LLM → streamText 真实路径；否则 mock 演示链路。 */
  send: (text: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  open: false,
  messages: [],
  status: "idle",
  error: null,

  setOpen: (open) => set({ open }),
  clear: () => set({ messages: [], error: null }),

  init: async () => {
    if (get().messages.length > 0) return;
    try {
      const history = await loadRecentChatMessages(100);
      set({ messages: history });
    } catch (e) {
      console.warn("[chat] history load failed", e);
    }
  },

  stop: () => {
    abortRealChat();
    cancelToken.current = true;
    set({ status: "idle" });
  },

  send: (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().status === "streaming") return;

    cancelToken.current = false;
    const userMsg: ChatMsg = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      toolCalls: [],
    };
    set((s) => ({ messages: [...s.messages, userMsg], status: "streaming", error: null }));
    void saveChatMessage(userMsg).catch(console.warn);

    let assistantId = "";
    const events = {
      onStart: (msgId: string, toolCalls: ToolCallView[]) => {
        assistantId = msgId;
        set((s) => ({
          messages: [
            ...s.messages,
            { id: msgId, role: "assistant", content: "", reasoning: "", toolCalls },
          ],
        }));
      },
      onDelta: (_msgId: string, delta: string) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m,
          ),
        }));
      },
      onReasoning: (_msgId: string, delta: string) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, reasoning: (m.reasoning ?? "") + delta } : m,
          ),
        }));
      },
      onTool: (_msgId: string, tc: ToolCallView) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  toolCalls: m.toolCalls.some((t) => t.id === tc.id)
                    ? m.toolCalls.map((t) => (t.id === tc.id ? tc : t))
                    : [...m.toolCalls, tc],
                }
              : m,
          ),
        }));
      },
      onDone: (msgId: string) => {
        if (cancelToken.current) return; // 已被 stop 接管
        set({ status: "idle" });
        const finalMsg = get().messages.find((m) => m.id === msgId);
        if (finalMsg) void saveChatMessage(finalMsg).catch(console.warn);
      },
    };

    const run = isLlmConfigured()
      ? runRealChat(events, get().messages)
      : runMockChat(trimmed, events, () => cancelToken.current);
    console.log("[chat] send →", isLlmConfigured() ? "real" : "mock", "| text:", trimmed.slice(0, 40));

    void run.catch((e) => {
      const msg = String(e?.message ?? e);
      console.error("[chat] run failed:", e);
      if (/abort/i.test(msg) || cancelToken.current) {
        set({ status: "idle" });
        return;
      }
      set({ status: "idle", error: msg });
    });
  },
}));

/** 当前运行的取消令牌（mock 路径轮询检查；真实路径走 AbortController）。 */
const cancelToken = { current: false };
