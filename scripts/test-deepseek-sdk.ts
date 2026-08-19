// 与 App 完全相同的 SDK 路径实测真实 DeepSeek：
// streamText + openai-compatible + 工具调用循环（stopWhen 放开）
import { streamText, tool, isStepCount } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

const KEY = process.env.DEEPSEEK_KEY ?? "";
const BASE = (process.env.DEEPSEEK_BASE ?? "https://api.deepseek.com/v1").replace(/\/+$/, "");
const MODEL = process.argv[2] ?? "deepseek-v4-flash";

const provider = createOpenAICompatible({
  name: "riliagent",
  baseURL: BASE,
  apiKey: KEY,
});
const model = provider.chatModel(MODEL);

let ok = true;
const expect = (cond: boolean, msg: string) => {
  if (!cond) {
    ok = false;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
};

// —— 场景 1：纯文本流式（与 App 相同的 stopWhen 配置） ——
console.log(`\n== 场景1 纯文本（模型 ${MODEL}） ==`);
const r1 = await streamText({
  model,
  system: "你是测试助手，回答要简短。",
  messages: [{ role: "user", content: "用三个字说明你是谁" }],
  stopWhen: isStepCount(4),
});
let t1 = "";
const parts1: string[] = [];
for await (const part of r1.fullStream) {
  parts1.push(part.type);
  if (part.type === "text-delta") t1 += part.text;
}
console.log("事件:", parts1.join(" → "));
console.log("回复:", t1);
expect(t1.length > 0, "场景1 有文本输出");
expect(parts1.includes("text-delta"), "场景1 流式 delta 正常");

// —— 场景 2：工具调用循环（让模型调用工具，再总结） ——
console.log(`\n== 场景2 工具调用循环 ==`);
let executed = false;
const r2 = await streamText({
  model,
  system: "你可以使用工具。当用户请求时先调用 echo 工具，再简短总结工具返回的内容。",
  messages: [{ role: "user", content: "请调用 echo 工具，参数 content 为「测试成功」，然后告诉我结果" }],
  tools: {
    echo: tool({
      description: "回显一段文字",
      inputSchema: z.object({ content: z.string() }),
      execute: async ({ content }) => {
        executed = true;
        return `回显：${content}`;
      },
    }),
  },
  stopWhen: isStepCount(6),
});
let t2 = "";
const parts2: string[] = [];
for await (const part of r2.fullStream) {
  parts2.push(part.type);
  if (part.type === "text-delta") t2 += part.text;
  if (part.type === "tool-call") console.log("  [tool-call]", part.toolName, JSON.stringify(part.input));
}
console.log("事件:", parts2.join(" → "));
console.log("回复:", t2);
expect(executed, "场景2 工具被真实执行");
expect(parts2.filter((p) => p === "tool-call").length >= 1, "场景2 出现工具调用");
expect(parts2.includes("start-step") && parts2.lastIndexOf("start-step") > parts2.indexOf("tool-result"), "场景2 多步续跑（第二轮请求）");
expect(t2.length > 0, "场景2 有最终文本");

// —— 场景 3：带工具历史的多轮请求（复刻 App 历史回放，真 API 验证 schema） ——
console.log(`\n== 场景3 历史回放（mock 风格历史，无 reasoning，真 API） ==`);
// 模拟 App 的 toCoreMessages：DeepSeek 端点通过消息级 providerOptions 注入空 reasoning_content
const history = [
  { role: "user", content: "明天下午 3 点和老王开会 1 小时" },
  {
    role: "assistant",
    providerOptions: { openaiCompatible: { reasoning_content: "" } },
    content: [
      { type: "text", text: "好的，我来帮你安排。" },
      {
        type: "tool-call",
        toolCallId: "hist-1",
        toolName: "calendar_createEvent",
        input: { title: "和老王开会", start: "2026-08-22T15:00", end: "2026-08-22T16:00" },
      },
    ] as never,
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "hist-1",
        toolName: "calendar_createEvent",
        output: { type: "text", value: "已创建事件" },
      },
    ] as never,
  },
] as never;
// 拦截请求体，看 provider 如何序列化空 reasoning part
const origFetch = globalThis.fetch;
let captured = "";
globalThis.fetch = (async (input: any, init?: any) => {
  const body = String(init?.body ?? "");
  if (body.includes("assistant")) captured = body.slice(0, 900);
  return origFetch(input, init);
}) as typeof fetch;
const r3 = await streamText({
  model,
  system: "基于历史继续对话。",
  messages: history,
  stopWhen: isStepCount(4),
});
let t3 = "";
let err3 = "";
for await (const part of r3.fullStream) {
  if (part.type === "text-delta") t3 += part.text;
  if (part.type === "error") err3 = String(part.error);
}
console.log("回复:", t3);
console.log("请求体 assistant 片段:", captured);
expect(!err3, `场景3 无 error part（空 reasoning 兜底生效）${err3 ? "：" + err3.slice(0, 200) : ""}`);
expect(t3.length > 0, "场景3 有文本输出");

process.exit(ok ? 0 : 1);
