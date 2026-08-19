// 复现 tauri-plugin-http 的完整 JS 路径（CJS 版）打真实 DeepSeek：
// 劫持插件依赖的 invoke → 用 node fetch 实现真实网络，其余（new Request / body /
// 分块 + 信号字节协议）全部走插件原版代码。若此处正常 = 问题在 WebView2 IPC 层。
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const KEY = process.env.DEEPSEEK_KEY ?? "";
const BASE = "https://api.deepseek.com/v1";
const MODEL = "deepseek-v4-flash";

// ---- 模拟 Tauri IPC：invoke 的三种命令 ----
let current = null; // { res, reader }
const myInvoke = async (cmd, args) => {
  switch (cmd) {
    case "plugin:http|fetch": {
      const c = args.clientConfig;
      const real = await fetch(c.url, {
        method: c.method,
        headers: c.headers,
        body: c.data ? new Uint8Array(c.data) : undefined,
      });
      current = { res: real, reader: real.body.getReader() };
      return 1; // rid
    }
    case "plugin:http|fetch_send": {
      const r = current.res;
      return {
        status: r.status,
        statusText: r.statusText,
        url: r.url,
        headers: [...r.headers.entries()],
        rid: 1,
      };
    }
    case "plugin:http|fetch_read_body": {
      const { done, value } = await current.reader.read();
      if (done) return [1]; // 结束信号字节
      return [...value, 0]; // 数据 + 非结束信号
    }
    case "plugin:http|fetch_cancel":
    case "plugin:http|fetch_cancel_body":
      return null;
    default:
      throw new Error(`unexpected cmd ${cmd}`);
  }
};

// ---- 劫持 @tauri-apps/api/core 的 invoke（require 缓存覆盖） ----
const core = require("@tauri-apps/api/core");
core.invoke = myInvoke;

// ---- 加载插件原版 JS（CJS 主入口，解构的是被替换后的 invoke） ----
const pluginFetch = require("@tauri-apps/plugin-http").fetch;

// ---- 走 AI SDK 完整路径 ----
const { streamText, isStepCount } = await import("ai");
const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");

const provider = createOpenAICompatible({
  name: "riliagent",
  baseURL: BASE,
  apiKey: KEY,
  fetch: pluginFetch,
});
const model = provider.chatModel(MODEL);

console.log("开始流式请求（插件原版 JS 路径）…");
const timeout = setTimeout(() => {
  console.error("FAIL: 10s 无任何输出（挂起复现）");
  process.exit(1);
}, 10_000);

let text = "";
let parts = 0;
try {
  const result = streamText({
    model,
    messages: [{ role: "user", content: "用两个字回复：你好" }],
    stopWhen: isStepCount(4),
  });
  for await (const part of result.fullStream) {
    parts++;
    if (part.type === "text-delta") text += part.text;
  }
  clearTimeout(timeout);
  console.log("事件数:", parts);
  console.log("TEXT:", text);
  if (!text) {
    console.error("FAIL: 无文本输出");
    process.exit(1);
  }
  console.log("OK: 插件 JS 路径在 node 下工作正常（问题在 WebView2/IPC 层或环境差异）");
  process.exit(0);
} catch (e) {
  clearTimeout(timeout);
  console.error("FAIL:", e?.constructor?.name, e?.message);
  console.error("DETAIL:", JSON.stringify(e, Object.getOwnPropertyNames(e ?? {}), 1).slice(0, 800));
  process.exit(1);
}
