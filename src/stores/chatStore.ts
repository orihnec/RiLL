import { create } from "zustand";
import type { ChatMsg, ToolCallView } from "../kernel/agent/types";
import { isLlmConfigured, runRealChat } from "../kernel/agent/runtime";
import { runMockChat } from "../kernel/agent/mock";
import { saveChatMessage } from "../kernel/chat";

interface ChatState {
  open: boolean;
  messages: ChatMsg[];
  status: "idle" | "streaming";
  error: string | null;
  setOpen: (open: boolean) => void;
  clear: () => void;
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

  send: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

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
            { id: msgId, role: "assistant", content: "", toolCalls },
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
        set({ status: "idle" });
        const finalMsg = get().messages.find((m) => m.id === msgId);
        if (finalMsg) void saveChatMessage(finalMsg).catch(console.warn);
      },
    };

    const run = isLlmConfigured()
      ? runRealChat(events, get().messages)
      : runMockChat(trimmed, events);

    void run.catch((e) => {
      console.error("[chat] run failed", e);
      set({ status: "idle", error: String(e) });
    });
  },
}));
