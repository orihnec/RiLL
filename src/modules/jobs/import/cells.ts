export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    const rich = value.every((item) => item && typeof item === "object" && "text" in item);
    return value.map(cellText).join(rich ? "" : " / ");
  }
  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    for (const key of ["text", "name", "value", "link"]) if (typeof item[key] === "string") return item[key];
    return JSON.stringify(value);
  }
  return String(value);
}

export function cellUrls(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap(cellUrls))];
  if (value && typeof value === "object") {
    const cell = value as Record<string, unknown>;
    return cellUrls(cell.link ?? cell.url ?? cell.text);
  }
  if (typeof value !== "string") return [];
  // 只有 API 返回的实际地址可写入，显示标题和未知公式不拼成 URL。
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? [url.href] : [];
  } catch { return []; }
}

export function sourceRowNumber(key: string): number {
  return Number(key.slice(key.lastIndexOf(":") + 1));
}
