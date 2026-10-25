import { readTextFile, readFile } from "@tauri-apps/plugin-fs";
import { basename } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

/** 上传附件（聊天随消息发送）。text 为解析后的文本（AI 上下文用）。 */
export interface ChatAttachment {
  name: string;
  text: string;
}

const MAX_CHARS = 30_000; // 解析后文本上限
const MAX_ROWS = 500; // 表格行数上限

/** 文件选择器过滤器（与支持的格式同步）。 */
export const ATTACHMENT_FILTERS = [
  { name: "文档", extensions: ["pdf", "docx"] },
  { name: "表格", extensions: ["xlsx", "xls"] },
  { name: "文本", extensions: ["txt", "md", "csv", "tsv", "json", "log", "yaml", "yml"] },
];

/** 直接读文本的扩展名白名单。 */
const TEXT_EXTS = new Set(["txt", "md", "csv", "tsv", "json", "log", "yaml", "yml", "text"]);

function truncate(text: string, extra = ""): string {
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…（已截断${extra}）` : text;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

/**
 * 解析上传文件为文本：
 * - .pdf → Rust `attach_extract`（扫描件会明确报"没有文本层"）
 * - .xlsx/.xls → 第一个工作表转"列: 值"表格
 * - .docx → Word 正文纯文本（mammoth 动态加载）
 * - 文本类（txt/md/csv/json/log…）→ 直接读取
 * - 其余（图片等）→ 报错提示
 */
export async function parseAttachmentFile(path: string): Promise<ChatAttachment> {
  const name = await basename(path);
  const ext = extOf(name);

  if (ext === "xlsx" || ext === "xls") {
    // 解析库不进首屏：仅上传表格时动态加载
    const XLSX = await import("xlsx");
    const data = await readFile(path);
    const wb = XLSX.read(data, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Excel 文件没有工作表");
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (rows.length === 0) throw new Error("Excel 第一个工作表没有数据");
    const lines = rows
      .slice(0, MAX_ROWS)
      .map((r) =>
        Object.entries(r)
          .filter(([, v]) => String(v) !== "")
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(" | "),
      );
    return { name, text: truncate(lines.join("\n"), `，共 ${rows.length} 行`) };
  }

  if (ext === "pdf") {
    // 走 Rust：pdf-extract 抽文本层（前端不引 pdf 解析库，首屏不膨胀）
    const res = await invoke<{ kind: string; text: string; chars: number; truncated: boolean }>(
      "attach_extract",
      { path },
    );
    return { name, text: truncate(res.text) };
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const data = await readFile(path);
    const result = await mammoth.extractRawText({ arrayBuffer: data.buffer as ArrayBuffer });
    const text = result.value.trim();
    if (!text) throw new Error("Word 文档没有可提取的文本");
    return { name, text: truncate(text) };
  }

  if (TEXT_EXTS.has(ext)) {
    return { name, text: truncate(await readTextFile(path)) };
  }

  throw new Error(`暂不支持该文件类型（.${ext || "未知"}）。支持：Excel(.xlsx)、Word(.docx)、文本(.txt/.md/.csv/.json/.log)`);
}
