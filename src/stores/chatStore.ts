import { create } from "zustand";
import type { ChatMsg, ToolCallView } from "../kernel/agent/types";
import { isLlmConfigured, runRealChat, abortRealChat } from "../kernel/agent/runtime";
import { runMockChat } from "../kernel/agent/mock";
import {
  createSession,
  deleteSession as deleteSessionDb,
  listSessions,
  loadSessionMessages,
  rollbackSession,
  saveChatMessage,
  searchChat,
  type ChatSearchHit,
  type SessionInfo,
} from "../kernel/chat";

interface ChatState {
  open: boolean;
  /** 面板视图：chat = 当前对话；history = 历史记录（列表/搜索/回退） */
  view: "chat" | "history";
  sessionId: string | null;
  sessions: SessionInfo[];
  messages: ChatMsg[];
  status: "idle" | "streaming";
  error: string | null;
  searchQuery: string;
  searchHits: ChatSearchHit[] | null;

  setOpen: (open: boolean) => void;
  setView: (view: "chat" | "history") => void;
  setSearchQuery: (q: string) => void;
  /** 启动：加载会话列表并恢复最近活跃会话 */
  init: () => Promise<void>;
  /** 新建对话（当前对话消息已实时落库，无需迁移） */
  newChat: () => Promise<void>;
  /** 切换/加载历史会话 */
  switchSession: (id: string) => Promise<void>;
  /** 删除会话（当前会话被删则自动落到最近会话或新建） */
  deleteSession: (id: string) => Promise<void>;
  /** 回退：保留到该消息（含），丢弃其后所有内容 */
  rollbackTo: (msgId: string) => Promise<void>;
  /** 搜索聊天记录（当前 + 全部历史） */
  search: (q: string) => Promise<void>;
  /** 中断当前流 */
  stop: () => void;
  send: (text: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  open: false,
  view: "chat",
  sessionId: null,
  sessions: [],
  messages: [],
  status: "idle",
  error: null,
  searchQuery: "",
  searchHits: null,

  setOpen: (open) => set({ open }),
  setView: (view) => set({ view }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  init: async () => {
    try {
      const sessions = await listSessions();
      const active = sessions[0] ?? (await createSession());
      const messages = await loadSessionMessages(active.id, 200);
      const refreshed = await listSessions();
      set({ sessionId: active.id, sessions: refreshed, messages });
    } catch (e) {
      console.warn("[chat] init failed", e);
    }
  },

  newChat: async () => {
    const id = await createSession();
    set({ sessionId: id, messages: [], view: "chat", sessions: await listSessions() });
  },

  switchSession: async (id) => {
    const messages = await loadSessionMessages(id, 200);
    set({ sessionId: id, messages, view: "chat", sessions: await listSessions(), error: null });
  },

  deleteSession: async (id) => {
    await deleteSessionDb(id);
    let sessions = await listSessions();
    if (id === get().sessionId) {
      const next = sessions[0];
      if (next) {
        const messages = await loadSessionMessages(next.id, 200);
        sessions = await listSessions();
        set({ sessionId: next.id, messages, sessions, view: "chat" });
      } else {
        const nid = await createSession();
        set({ sessionId: nid, messages: [], sessions: await listSessions(), view: "chat" });
      }
    } else {
      set({ sessions });
    }
  },

  rollbackTo: async (msgId) => {
    const sid = get().sessionId;
    if (!sid) return;
    await rollbackSession(sid, msgId);
    const idx = get().messages.findIndex((m) => m.id === msgId);
    const messages = idx >= 0 ? get().messages.slice(0, idx + 1) : get().messages;
    set({ messages, sessions: await listSessions() });
  },

  search: async (q) => {
    const query = q.trim();
    if (!query) {
      set({ searchHits: null });
      return;
    }
    try {
      set({ searchHits: await searchChat(query) });
    } catch (e) {
      console.warn("[chat] search failed", e);
      set({ searchHits: [] });
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
    const sessionId = get().sessionId;
    if (!sessionId) return;

    cancelToken.current = false;
    const userMsg: ChatMsg = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      toolCalls: [],
    };
    set((s) => ({ messages: [...s.messages, userMsg], status: "streaming", error: null }));
    void saveChatMessage(userMsg, sessionId).catch(console.warn);

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
        if (finalMsg) void saveChatMessage(finalMsg, sessionId).catch(console.warn);
        void listSessions().then((sessions) => set({ sessions })).catch(console.warn);
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
