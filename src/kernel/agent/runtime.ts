import { streamText, generateText, tool, isStepCount } from "ai";
import type { ModelMessage, LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { toolRegistry } from "./registry";
import { buildSystemPrompt } from "./prompts";
import { useSettingsStore, getActiveProvider } from "../../stores/settingsStore";
import type { ChatMsg, ToolCallView } from "./types";

/** LLM 是否已配置（当前供应商保存了 baseURL + 模型 + key）。 */
export function isLlmConfigured(): boolean {
  const p = getActiveProvider();
  return !!p && p.apiKeySet && p.baseUrl.trim() !== "" && p.chatModel.trim() !== "";
}

let cachedKey = "";
let cachedModel: LanguageModel | null = null;

/**
 * 当前供应商的模型实例（fetch 走 tauri-plugin-http，绕开 webview CORS）。
 * 协议并行：responses = OpenAI 官方 API；openai-compatible = 任意兼容端点（chat/completions）。
 */
export function getChatModel(): LanguageModel {
  const p = getActiveProvider();
  const baseUrl = p?.baseUrl ?? "";
  const chatModel = p?.chatModel ?? "";
  const apiKey = p?.apiKey ?? "";
  const url = baseUrl.trim().replace(/\/+$/, "");
  const key = `${p?.id ?? ""}|${p?.protocol ?? ""}|${url}|${chatModel}|${apiKey ? "k" : ""}`;
  if (!cachedModel || cachedKey !== key) {
    if (p?.protocol === "responses") {
      const provider = createOpenAI({
        name: "riliagent",
        baseURL: url || "https://api.openai.com/v1",
        apiKey,
        fetch: tauriFetch,
      });
      cachedModel = provider.responses(chatModel) as unknown as LanguageModel;
    } else {
      const provider = createOpenAICompatible({
        name: "riliagent",
        baseURL: url,
        apiKey,
        fetch: tauriFetch,
      });
      cachedModel = provider.chatModel(chatModel) as unknown as LanguageModel;
    }
    cachedKey = key;
  }
  return cachedModel;
}

/** 拉取供应商模型列表（设置页/聊天面板"获取模型"用）。15s 超时防挂起。 */
export async function fetchAvailableModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = `${baseUrl.trim().replace(/\/+$/, "")}/models`;
  const res = await Promise.race([
    tauriFetch(url, { headers: { Authorization: `Bearer ${apiKey}` } }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("请求超时（15 秒）")), 15_000),
    ),
  ]);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}：${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: { id: string }[] };
  return (json.data ?? []).map((m) => m.id);
}

/** 正在拉取模型的供应商（防并发重复请求）。 */
const modelFetchInFlight = new Set<string>();

/**
 * 拉取某供应商的模型列表并写入缓存（自动识别模型）。
 * 返回模型列表；未配置 key/baseURL 或已在拉取中返回 null。
 */
export async function refreshProviderModels(providerId: string): Promise<string[] | null> {
  if (modelFetchInFlight.has(providerId)) return null;
  const p = useSettingsStore.getState().providers.find((x) => x.id === providerId);
  if (!p || !p.baseUrl.trim() || !p.apiKeySet) return null;
  modelFetchInFlight.add(providerId);
  try {
    const list = await fetchAvailableModels(p.baseUrl, p.apiKey);
    useSettingsStore.getState().updateProvider(providerId, { models: list });
    return list;
  } finally {
    modelFetchInFlight.delete(providerId);
  }
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

/** DeepSeek thinking 模式要求历史 assistant 消息回传 reasoning_content（无则补空串）。
 *  仅 openai-compatible 协议需要（responses 协议由 SDK 处理）。 */
function needsReasoningPassthrough(provider: { protocol?: string; baseUrl: string } | null): boolean {
  return provider?.protocol !== "responses" && /deepseek/i.test(provider?.baseUrl ?? "");
}

/** 历史消息 → ModelMessage[]（含推理/工具调用与结果，供多轮对话上下文）。 */
function toCoreMessages(msgs: ChatMsg[], provider: { protocol?: string; baseUrl: string } | null): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of msgs) {
    if (m.role === "user") {
      // 附件拼进上下文：AI 可见完整内容（UI 只显示文件名）
      let content = m.content;
      if (m.attachments && m.attachments.length > 0) {
        const parts = m.attachments.map((a) => `[附件：${a.name}]\n${a.text}`);
        content = `${parts.join("\n\n---\n\n")}\n\n${m.content}`;
      }
      out.push({ role: "user", content });
      continue;
    }
    const parts: { type: string; text?: string }[] = [];
    if (m.reasoning) parts.push({ type: "reasoning", text: m.reasoning });
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
      const msg: Record<string, unknown> = { role: "assistant", content: parts };
      // DeepSeek thinking 模式：历史 assistant 消息必须带 reasoning_content（无则空串）。
      // provider 对空 reasoning part 会省略该字段，故走消息级 providerOptions 透传
      // （openaiCompatible 命名空间原样合并进消息 JSON，空串也会输出）。
      if (needsReasoningPassthrough(provider)) {
        msg.providerOptions = { openaiCompatible: { reasoning_content: m.reasoning ?? "" } };
      }
      out.push(msg as never);
    }
    for (const tc of m.toolCalls) {
      // v7 的 tool-result part 需要 output 对象（{type:'text'|'error-text', value}），不是裸字符串
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: tc.id,
            toolName: tc.name,
            output:
              tc.status === "error"
                ? { type: "error-text", value: tc.result ?? "tool error" }
                : { type: "text", value: tc.result ?? "" },
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

/** 工具结果给 UI / 上下文的上限：超长截断并注明（避免一次查询把窗口塞满）。 */
const MAX_RESULT_CHARS = 4000;
/** 一轮对话里最多几步（每步 = 一次模型调用 + 其工具执行） */
const MAX_STEPS = 12;
function clip(text: string): string {
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}\n…（结果过长，已截断 ${text.length - MAX_RESULT_CHARS} 字符）`
    : text;
}

/** 与 mock 共用的事件回调（由 chatStore 实现）。 */
export interface ChatRunEvents {
  onStart: (msgId: string, toolCalls: ToolCallView[]) => void;
  onDelta: (msgId: string, delta: string) => void;
  onReasoning: (msgId: string, delta: string) => void;
  onTool: (msgId: string, tc: ToolCallView) => void;
  onDone: (msgId: string) => void;
}

/**
 * 真实 LLM 路径：AI SDK streamText（纯客户端，浏览器运行时）
 * 自动多步工具循环（stopWhen 放开步数上限），流式增量回传给 UI。
 * 流式失败时自动降级为一次性 generateText（保证可用性）。
 */
export async function runRealChat(
  events: ChatRunEvents,
  history: ChatMsg[],
): Promise<void> {
  const msgId = crypto.randomUUID();
  const system = await buildSystemPrompt();
  events.onStart(msgId, []);

  const provider = getActiveProvider();
  const model = getChatModel();
  const messages = toCoreMessages(history, provider);
  const tools = toAiTools();

  const abort = new AbortController();
  currentAbort = abort;

  // 看门狗：防传输层挂起导致状态永久 streaming（90s 后强制中止并报错）
  let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    watchdogTimer = setTimeout(() => {
      abort.abort();
      reject(new Error("请求超时（90 秒），已中止"));
    }, 90_000);
  });

  try {
    const consume = (async () => {
      // 已经发生过工具调用 → 不许走"一次性重放"兜底（否则会重复建日程）
      let sawToolCall = false;
      try {
        const result = streamText({
        model,
        system,
        // history 已包含 send() 刚追加的用户消息
        messages,
        tools,
        // 默认 stopWhen 是 isStepCount(1)：必须显式放开才能自动续跑工具循环
        stopWhen: isStepCount(MAX_STEPS),
        abortSignal: abort.signal,
        // 不设单次 timeout：多步工具循环（一次建 3 个日程）本来就慢，
        // 30s 会把它误判成"传输失败"，然后兜底重放 → 重复事件。挂起交给 90s 看门狗。
      });

      let content = "";
      let reasoning = "";
      const toolViews = new Map<string, ToolCallView>();

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          content += part.text;
          events.onDelta(msgId, part.text);
        } else if (part.type === "reasoning-delta") {
          reasoning += (part as { text?: string }).text ?? "";
          events.onReasoning(msgId, (part as { text?: string }).text ?? "");
        } else if (part.type === "tool-call") {
          const tc = part as typeof part & { toolCallId: string; toolName: string; input?: unknown };
          sawToolCall = true;
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
            const next: ToolCallView = { ...prev, status: "done", result: clip(fmtResult(tr.output)) };
            toolViews.set(tr.toolCallId, next);
            events.onTool(msgId, next);
          }
        } else if (part.type === "tool-error") {
          // 工具抛错不算整轮失败：标红让模型看到并自己换策略（DSH 也是这么做的）
          const te = part as typeof part & { toolCallId: string; error?: unknown };
          const prev = toolViews.get(te.toolCallId);
          if (prev) {
            const next: ToolCallView = {
              ...prev,
              status: "error",
              result: clip(te.error instanceof Error ? te.error.message : String(te.error)),
            };
            toolViews.set(te.toolCallId, next);
            events.onTool(msgId, next);
          }
        } else if (part.type === "error") {
          // 流级别的错误必须上抛，否则 UI 表现为"无错误也无反应"
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }
      }
    } catch (e) {
      // 工具已经开始执行 → 直接报错，绝不重放（重放会重复创建日程）
      if (sawToolCall) throw e;
      // 还没碰过工具（纯文本请求失败）：降级为一次性请求，保证可用性
      console.warn("[chat] streaming failed, fallback to one-shot:", e);
      const res = await generateText({
        model,
        system,
        messages,
        tools,
        stopWhen: isStepCount(MAX_STEPS),
      });
      const calls = ((res as unknown as { toolCalls?: { toolCallId: string; toolName: string; input?: unknown }[] }).toolCalls ?? []);
      const results = ((res as unknown as { toolResults?: { toolCallId: string; output?: unknown }[] }).toolResults ?? []);
      for (const tc of calls) {
        const view: ToolCallView = {
          id: tc.toolCallId,
          name: tc.toolName,
          args: (tc.input ?? {}) as Record<string, unknown>,
          status: "running",
        };
        events.onTool(msgId, view);
        const tr = results.find((r) => r.toolCallId === tc.toolCallId);
        events.onTool(msgId, {
          ...view,
          status: tr ? "done" : "error",
          result: tr ? fmtResult(tr.output) : "无返回结果",
        });
      }
      if (res.text) events.onDelta(msgId, res.text);
        }
      })();

      await Promise.race([consume, watchdog]);
      events.onDone(msgId);
  } finally {
      clearTimeout(watchdogTimer);
      currentAbort = null;
  }
}

let currentAbort: AbortController | null = null;

/** 中断当前真实 LLM 流（聊天面板"停止"按钮）。 */
export function abortRealChat(): void {
  currentAbort?.abort();
}
