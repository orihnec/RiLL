import { streamText, tool, isStepCount } from "ai";
import type { ModelMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { toolRegistry } from "./registry";
import { buildSystemPrompt } from "./prompts";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ChatMsg, ToolCallView } from "./types";

/** LLM 是否已配置（设置页保存了 baseURL + 模型 + key）。 */
export function isLlmConfigured(): boolean {
  const { llm } = useSettingsStore.getState();
  return llm.apiKeySet && llm.baseUrl.trim() !== "" && llm.chatModel.trim() !== "";
}

let cachedKey = "";
let cachedProvider: ReturnType<typeof createOpenAICompatible> | null = null;

/** OpenAI 兼容 provider（fetch 走 tauri-plugin-http，绕开 webview CORS）。 */
export function getChatModel() {
  const { baseUrl, chatModel, apiKey } = useSettingsStore.getState().llm;
  const key = `${baseUrl}|${chatModel}|${apiKey ? "k" : ""}`;
  if (!cachedProvider || cachedKey !== key) {
    cachedProvider = createOpenAICompatible({
      name: "riliagent",
      baseURL: baseUrl,
      apiKey,
      fetch: tauriFetch,
    });
    cachedKey = key;
  }
  return cachedProvider.chatModel(chatModel);
}

/** 注册表中的工具 → AI SDK 工具定义（客户端执行 + 自动多步循环）。 */
export function toAiTools() {
  return Object.fromEntries(
    toolRegistry.getAll().map((t) => [
      t.name,
      tool({
        description: t.description,
        // 我们统一的 Tool 接口与 AI SDK 的 schema/execute 类型在边界处对齐
        inputSchema: t.parameters as never,
        execute: t.execute as never,
      }),
    ]),
  );
}

/** 历史消息 → ModelMessage[]（含工具调用与结果，供多轮对话上下文）。 */
function toCoreMessages(msgs: ChatMsg[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of msgs) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
      continue;
    }
    const parts: { type: "text"; text: string }[] = [];
    if (m.content) parts.push({ type: "text", text: m.content });
    for (const tc of m.toolCalls) {
      parts.push({
        type: "tool-call",
        toolCallId: tc.id,
        toolName: tc.name,
        input: tc.args as Record<string, unknown>,
      } as never);
    }
    if (parts.length > 0) {
      out.push({ role: "assistant", content: parts as never });
    }
    for (const tc of m.toolCalls) {
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: tc.id,
            toolName: tc.name,
            result: tc.result ?? "",
          },
        ] as never,
      });
    }
  }
  return out;
}

function fmtResult(r: unknown): string {
  if (typeof r === "string") return r;
  try {
    return JSON.stringify(r, null, 1);
  } catch {
    return String(r);
  }
}

/** 与 mock 共用的事件回调（由 chatStore 实现）。 */
export interface ChatRunEvents {
  onStart: (msgId: string, toolCalls: ToolCallView[]) => void;
  onDelta: (msgId: string, delta: string) => void;
  onTool: (msgId: string, tc: ToolCallView) => void;
  onDone: (msgId: string) => void;
}

/**
 * 真实 LLM 路径：AI SDK streamText（纯客户端，浏览器运行时）
 * 自动多步工具循环（stopWhen 放开步数上限），流式增量回传给 UI。
 */
export async function runRealChat(
  events: ChatRunEvents,
  history: ChatMsg[],
): Promise<void> {
  const msgId = crypto.randomUUID();
  const system = await buildSystemPrompt();
  events.onStart(msgId, []);

  const result = streamText({
    model: getChatModel(),
    system,
    // history 已包含 send() 刚追加的用户消息
    messages: toCoreMessages(history),
    tools: toAiTools(),
    // 默认 stopWhen 是 isStepCount(1)：必须显式放开才能自动续跑工具循环
    stopWhen: isStepCount(8),
  });

  let content = "";
  const toolViews = new Map<string, ToolCallView>();

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      content += part.text;
      events.onDelta(msgId, part.text);
    } else if (part.type === "tool-call") {
      const tc = part as typeof part & { toolCallId: string; toolName: string; input?: unknown };
      const tv: ToolCallView = {
        id: tc.toolCallId,
        name: tc.toolName,
        args: (tc.input ?? {}) as Record<string, unknown>,
        status: "running",
      };
      toolViews.set(tc.toolCallId, tv);
      events.onTool(msgId, tv);
    } else if (part.type === "tool-result") {
      const tr = part as typeof part & { toolCallId: string; output?: unknown };
      const prev = toolViews.get(tr.toolCallId);
      if (prev) {
        const next: ToolCallView = { ...prev, status: "done", result: fmtResult(tr.output) };
        toolViews.set(tr.toolCallId, next);
        events.onTool(msgId, next);
      }
    } else if (part.type === "error") {
      console.error("[chat] stream part error", part.error);
    }
  }

  events.onDone(msgId);
}
