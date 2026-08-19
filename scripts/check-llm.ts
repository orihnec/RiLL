// LLM 运行时无头验证（npx tsx scripts/check-llm.ts）
// 用 mock fetch 伪造 OpenAI 兼容 SSE 流，驱动 streamText：
//   场景 A：纯文本流式
//   场景 B：工具调用 → 客户端执行 → 二次请求 → 最终文本（验证 maxSteps 多步循环）
import { streamText, tool, isStepCount } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

let callCount = 0;
let mode: "text" | "tool" = "text";

function sseResponse(json: unknown): Response {
  const enc = new TextEncoder();
  const chunks = Array.isArray(json) ? json : [json];
  const bodyStr = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(bodyStr));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const mockFetch = async (_url: unknown, init?: { body?: string }) => {
  callCount++;
  const body = String(init?.body ?? "");
  const chunk = (delta: Record<string, unknown>, finish: string | null) => ({
    id: "c1",
    object: "chat.completion.chunk",
    created: 0,
    model: "mock",
    choices: [{ index: 0, delta, finish_reason: finish }],
  });

  if (mode === "text") {
    return sseResponse([
      chunk({ role: "assistant", content: "你好" }, null),
      chunk({ content: "，世界" }, null),
      chunk({}, "stop"),
    ]);
  }
  // 工具模式：第一次请求返回工具调用；后续请求返回最终文本
  if (!body.includes('"role":"tool"')) {
    return sseResponse([
      chunk(
        {
          tool_calls: [
            { index: 0, id: "call_1", type: "function", function: { name: "echo_tool", arguments: "{}" } },
          ],
        },
        "tool_calls",
      ),
    ]);
  }
  return sseResponse([chunk({ content: "工具已执行，一切正常" }, null), chunk({}, "stop")]);
};

const provider = createOpenAICompatible({
  name: "mock",
  baseURL: "https://mock.local/v1",
  apiKey: "test-key",
  fetch: mockFetch as never,
});
const model = provider.chatModel("mock-model") as never;

let ok = true;
const expect = (cond: boolean, msg: string) => {
  if (!cond) {
    ok = false;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
};

// —— 场景 A：纯文本流式 ——
mode = "text";
callCount = 0;
const resultA = await streamText({
  model,
  system: "你是测试助手",
  messages: [{ role: "user", content: "你好" }],
  maxSteps: 2,
});
const textA = await resultA.text;
expect(textA === "你好，世界", `场景A 文本拼接：「${textA}」`);
expect(callCount === 1, `场景A 请求次数 1（实际 ${callCount}）`);

// —— 场景 B：工具调用 → 客户端执行 → 自动续跑 ——
mode = "tool";
callCount = 0;
let executed = false;
const resultB = await streamText({
  model,
  system: "测试工具",
  messages: [{ role: "user", content: "调用工具" }],
  tools: {
    echo_tool: tool({
      description: "测试工具",
      parameters: z.object({}),
      execute: async () => {
        executed = true;
        return "执行成功";
      },
    }),
  },
  stopWhen: isStepCount(4),
});
const partsB: string[] = [];
for await (const part of resultB.fullStream) {
  partsB.push(part.type);
  if (part.type === "tool-call" || part.type === "tool-result") {
    console.log("  [part]", part.type, JSON.stringify(part));
  }
}
console.log("场景B 事件序列:", partsB.join(" → "));
const textB = await resultB.text;
expect(executed, "场景B 客户端工具已执行");
expect(callCount === 2, `场景B 两轮请求（先工具后文本），实际 ${callCount}`);
expect(textB === "工具已执行，一切正常", `场景B 最终文本：「${textB}」`);

process.exit(ok ? 0 : 1);
