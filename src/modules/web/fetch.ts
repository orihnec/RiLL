import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/** 抓网页正文的结果（喂给模型用）。 */
export interface WebPage {
  url: string;
  title: string;
  text: string;
  /** 是否因超长被截断 */
  truncated: boolean;
  /** 原始字符数（截断前），便于提示 */
  chars: number;
}

/** 单页最多给模型的字符数：再长也没意义，反而挤掉对话上下文。 */
const MAX_CHARS = 8000;

/**
 * HTML → 纯文本。
 *
 * 用 WebView 自带的 DOMParser（不引第三方库）：先删脚本/样式/导航等噪音，
 * 再取 innerText 保留段落换行。比正则剥标签可靠得多。
 */
function htmlToText(raw: string): { title: string; text: string } {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  doc
    .querySelectorAll("script,style,noscript,svg,iframe,nav,footer,header,form,aside")
    .forEach((el) => el.remove());
  const title = (doc.querySelector("title")?.textContent ?? "").trim();
  const body = doc.body;
  const text = (body?.innerText ?? body?.textContent ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

/**
 * 抓一个网页并转成纯文本（走 tauri-plugin-http，绕开 webview 的 CORS）。
 *
 * 只接受 http/https 与 html/text 响应；PDF 之类明确报错（让用户改用附件/知识库）。
 */
export async function fetchPage(url: string, maxChars = MAX_CHARS): Promise<WebPage> {
  const target = url.trim();
  if (!/^https?:\/\//i.test(target)) throw new Error("只支持 http/https 链接");

  const res = await tauriFetch(target, {
    headers: {
      // 有些站点对空 UA 直接 403
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}（${res.statusText || "请求失败"}）`);

  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  if (type.includes("application/pdf")) {
    throw new Error("这是 PDF：下载后拖进知识库或聊天附件即可，本工具只读网页");
  }
  if (type && !type.includes("html") && !type.includes("text/")) {
    throw new Error(`不支持的内容类型：${type.split(";")[0]}`);
  }

  const raw = await res.text();
  const parsed = type.includes("html") ? htmlToText(raw) : { title: "", text: raw };
  const chars = parsed.text.length;
  const text = chars > maxChars ? `${parsed.text.slice(0, maxChars)}\n…（已截断）` : parsed.text;

  return {
    url: res.url || target,
    title: parsed.title,
    text,
    truncated: chars > maxChars,
    chars,
  };
}
