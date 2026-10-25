import type { z } from "zod";

/**
 * Agent 工具。命名规范：{模块}_{动词}（如 calendar_createEvent）。
 * description 写给 LLM 看：写清使用时机与参数含义。
 * 全量注入（不需要路由）：当前约 32 个工具，每个请求多花 ~1-2k token 换实现简单；
 * 超过 ~40 个时该改成按意图筛选/分组，否则会开始影响选工具的准确率。
 */
export interface Tool {
  name: string;
  description: string;
  /** zod 参数 schema（LLM 参数校验 + AI SDK 工具定义共用） */
  parameters: z.ZodTypeAny;
  /** 执行工具，返回给 LLM 的文本结果 */
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/** 对话面板展示用：一次工具调用的视图状态。 */
export interface ToolCallView {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "error";
  result?: string;
}

/** 归一化聊天消息（mock 与真实 LLM 共用同一渲染模型）。 */
export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 推理模型的思考过程（DeepSeek thinking 模式需原样回传） */
  reasoning?: string;
  toolCalls: ToolCallView[];
  /** 用户消息附带的文件（解析后的文本；AI 上下文可见，UI 只显示文件名） */
  attachments?: { name: string; text: string }[];
}
