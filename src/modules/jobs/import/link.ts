import type { FeishuLink } from "./types";

const ID = /^[A-Za-z0-9_-]{1,160}$/;

function optionalId(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) throw new Error(`链接包含重复的 ${name} 参数`);
  const value = values[0] || null;
  if (value !== null && !ID.test(value)) throw new Error(`链接中的 ${name} 标识无效`);
  return value;
}

export function parseFeishuLink(input: string): FeishuLink {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("请输入完整的飞书表格链接"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !(url.hostname === "feishu.cn" || url.hostname.endsWith(".feishu.cn"))) {
    throw new Error("仅支持 https://*.feishu.cn 下的飞书表格链接");
  }
  if (url.pathname.startsWith("/wiki/")) throw new Error("暂不支持知识库包装链接，请复制原始表格链接");
  const match = /^\/(sheets|base)\/([A-Za-z0-9_-]{1,160})\/?$/.exec(url.pathname);
  if (!match) throw new Error("仅支持飞书电子表格和多维表格链接");
  const sheetId = optionalId(url, "sheet");
  const tableId = optionalId(url, "table");
  const viewId = optionalId(url, "view");
  const canonical = new URL(`/${match[1]}/${match[2]}`, url.origin);
  if (sheetId) canonical.searchParams.set("sheet", sheetId);
  if (tableId) canonical.searchParams.set("table", tableId);
  if (viewId) canonical.searchParams.set("view", viewId);
  return { kind: match[1] as FeishuLink["kind"], documentToken: match[2],
    sheetId, tableId, viewId, canonicalUrl: canonical.href };
}

export function apiId(id: string): string {
  if (!ID.test(id)) throw new Error("飞书返回了无效的资源标识");
  return encodeURIComponent(id);
}
