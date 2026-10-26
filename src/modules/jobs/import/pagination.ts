import type { FeishuRequest } from "./types";

interface Page<T> { items?: T[]; has_more?: boolean; page_token?: string; }

export async function allPages<T>(request: FeishuRequest, path: string, query: Record<string, string> = {},
  onPage?: (rows: T[]) => void, maxItems = 10_000): Promise<T[]> {
  const items: T[] = [];
  const cursors = new Set<string>();
  let cursor = "";
  let bytes = 0;
  for (let page = 0; page < 1000; page++) {
    const data = await request<Page<T>>(path, { ...query, page_size: "100", ...(cursor ? { page_token: cursor } : {}) });
    if (!Array.isArray(data.items) || typeof data.has_more !== "boolean") {
      throw new Error("飞书分页响应不完整，已停止读取");
    }
    bytes += new TextEncoder().encode(JSON.stringify(data.items)).byteLength;
    if (items.length + data.items.length > maxItems || bytes > 32 * 1024 * 1024) {
      throw new Error(`来源超过 ${maxItems} 条或 32 MiB 上限，请缩小视图范围后重试`);
    }
    items.push(...data.items);
    onPage?.(data.items);
    if (!data.has_more) return items;
    if (!data.page_token || cursors.has(data.page_token) || !data.items.length) {
      throw new Error("飞书分页游标重复或缺失，无法确认已完整读取");
    }
    cursors.add(data.page_token);
    cursor = data.page_token;
  }
  throw new Error("分页次数超过上限，请缩小读取范围");
}
