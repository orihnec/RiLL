// 诊断 DeepSeek 推理模式：reasoning_content 的存取链路
import { streamText, isStepCount } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const KEY = process.env.DEEPSEEK_KEY ?? "";
const BASE = "https://api.deepseek.com/v1";
const MODEL = "deepseek-v4-flash";

// 1) 原始响应：看 DeepSeek 返回什么字段
const raw = await fetch(`${BASE}/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: "1+1=?" }],
    stream: false,
    max_tokens: 50,
  }),
});
const rawJson = (await raw.json()) as Record<string, unknown>;
console.log("原始响应 keys:", Object.keys(rawJson));
const msg0 = (rawJson.choices as { message: Record<string, unknown> }[])[0].message;
console.log("message keys:", Object.keys(msg0));
console.log("有 reasoning_content:", "reasoning_content" in msg0, "| 长度:", String(msg0.reasoning_content ?? "").length);

// 2) AI SDK 一轮：推理内容落到哪
const provider = createOpenAICompatible({ name: "riliagent", baseURL: BASE, apiKey: KEY });
const r1 = await streamText({
  model: provider.chatModel(MODEL),
  messages: [{ role: "user", content: "1+1=?" }],
  stopWhen: isStepCount(2),
});
let reasoning = "";
let text = "";
for await (const part of r1.fullStream) {
  if (part.type === "reasoning-delta") reasoning += (part as { text?: string }).text ?? "";
  if (part.type === "text-delta") text += part.text;
}
console.log("\nSDK 收流: reasoning 长度 =", reasoning.length, "| 文本 =", text.slice(0, 30));

// 3) 请求构造：第二轮时 assistant 消息里有什么（推理内容是否回传）
const provider2 = createOpenAICompatible({ name: "riliagent", baseURL: BASE, apiKey: KEY });
const seen = { body: "" };
const origFetch = globalThis.fetch;
// 拦截第二轮请求体，看 assistant 消息结构
globalThis.fetch = (async (input: any, init?: any) => {
  const body = String(init?.body ?? "");
  if (body.includes('"role":"assistant"') || body.includes("reasoning")) {
    seen.body = body.slice(0, 1200);
  }
  return origFetch(input, init);
}) as typeof fetch;

try {
  const r2 = await streamText({
    model: provider2.chatModel(MODEL),
    messages: [
      { role: "user", content: "1+1=?" },
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: reasoning || "（推理内容占位）" },
          { type: "text", text },
        ] as never,
      },
      { role: "user", content: "那 2+2 呢？" },
    ] as never,
    stopWhen: isStepCount(2),
  });
  let t = "";
  let err = "";
  for await (const part of r2.fullStream) {
    if (part.type === "text-delta") t += part.text;
    if (part.type === "error") err = String(part.error);
  }
  console.log("\n第二轮回复:", t.slice(0, 40), err ? `| ERROR: ${err.slice(0, 200)}` : "");
  console.log("第二轮请求体中 assistant 消息片段:");
  console.log(seen.body || "(未捕获)");
} finally {
  globalThis.fetch = origFetch;
}
