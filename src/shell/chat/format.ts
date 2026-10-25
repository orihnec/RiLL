/* 聊天面板的纯函数与文案工具（无 React 依赖，可单测）。 */

/** 首行（思考摘要用）。 */
export function firstLine(text: string): string {
  const nl = text.indexOf("\n");
  return nl === -1 ? text : text.slice(0, nl);
}

/** 末行（运行中跟随最新输出）。 */
export function latestLine(text: string): string {
  const visible = text.trimEnd();
  const nl = visible.lastIndexOf("\n");
  return nl === -1 ? visible : visible.slice(nl + 1);
}

/** 耗时：45s / 2m10s。 */
export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

/**
 * 复制文本到剪贴板。
 * WebView2 里 clipboard API 可能无权限，退回隐藏 textarea + execCommand。
 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }
}

/** 工具参数人性化：时间戳 → 本地时间，其余原样/JSON。 */
export function fmtArgValue(v: unknown): string {
  if (typeof v === "number" && v > 1e11) {
    return new Date(v).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (typeof v === "string") return v;
  return JSON.stringify(v) ?? String(v);
}
