// DeepSeek API 实测（key 从环境变量 DEEPSEEK_KEY 读取，不写入仓库）
const KEY = process.env.DEEPSEEK_KEY ?? "";
const BASE = (process.env.DEEPSEEK_BASE ?? "https://api.deepseek.com/v1").replace(/\/+$/, "");

// 1) 模型列表
const modelsRes = await fetch(`${BASE}/models`, {
  headers: { Authorization: `Bearer ${KEY}` },
});
console.log("GET /models →", modelsRes.status);
const models = (await modelsRes.json()) as { data?: { id: string }[] };
console.log(
  "可用模型:",
  (models.data ?? []).map((m) => m.id).join(", ") || JSON.stringify(models).slice(0, 500),
);

// 2) 流式补全（候选模型，可用参数覆盖）
const model = process.argv[2] ?? "deepseek-chat";
const res = await fetch(`${BASE}/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: "只回复两个字：你好" }],
    stream: true,
    max_tokens: 50,
  }),
});
console.log(`POST /chat/completions (${model}, stream) →`, res.status);
if (!res.ok) {
  console.log("响应体:", (await res.text()).slice(0, 800));
  process.exit(1);
}
const reader = res.body!.getReader();
const dec = new TextDecoder();
let sse = "";
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  sse += dec.decode(value, { stream: true });
}
const hasData = sse.includes("data:");
const hasDone = sse.includes("[DONE]");
console.log("SSE 前缀:", sse.slice(0, 300).replace(/\n/g, "⏎"));
console.log("含 data 行:", hasData, "| 含 [DONE]:", hasDone, "| 总长:", sse.length);
