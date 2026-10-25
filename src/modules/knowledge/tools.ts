import { z } from "zod";
import type { Tool } from "../../kernel/agent/types";
import { hybridSearch } from "../../kernel/rag/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getDb } from "../../kernel/db";
import { createKbFile, appendKbFile, indexFile, listKbDocs, type KbDocRow } from "./ingest";

/** 知识库根目录（app_settings.kb_root），未配置返回 null。 */
export async function kbRoot(): Promise<string | null> {
  const db = getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = 'kb_root'",
  );
  return rows[0]?.value || null;
}

/** 路径守卫：只允许访问知识库根目录内的文件（工具由 LLM 驱动，必须防越界）。 */
async function guardPath(relOrAbs: string): Promise<string> {
  const root = await kbRoot();
  if (!root) throw new Error("知识库尚未配置，请先在应用里选择知识库文件夹");
  const normalized = relOrAbs.replace(/\\/g, "/").replace(/^\.\//, "");
  const isAbs = /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/");
  const full = isAbs ? normalized : (await join(root, normalized)).replace(/\\/g, "/");
  const r = root.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!(full === r || full.startsWith(r + "/"))) {
    throw new Error(`路径不在知识库目录内：${relOrAbs}`);
  }
  return full;
}

function fmtHits(hits: Awaited<ReturnType<typeof hybridSearch>>): string {
  if (hits.length === 0) return "（无相关结果）";
  return hits
    .map(
      (h, i) =>
        `${i + 1}. [${h.title || h.source}]（${h.source}，相关度 ${h.score.toFixed(2)}）\n${h.content.slice(0, 400)}`,
    )
    .join("\n\n");
}

/** 两阶段精读：kb_search 找到来源后，用 kb_readDoc 读全文。 */
const kb_search: Tool = {
  name: "kb_search",
  description:
    "在个人知识库中检索与 query 相关的片段（混合检索：全文 + 语义）。返回相关片段列表（含文件路径）。回答知识库问题前先调用本工具；需要完整上下文时再对返回的路径调用 kb_readDoc。",
  parameters: z.object({
    query: z.string().describe("检索关键词或问题，中文直接输入"),
    limit: z.number().int().min(1).max(20).optional().describe("返回条数，默认 8"),
  }),
  execute: async (args) => {
    const query = String(args.query ?? "").trim();
    if (!query) return "query 不能为空";
    const limit = typeof args.limit === "number" ? args.limit : 8;
    const hits = await hybridSearch(query, limit);
    return fmtHits(hits);
  },
};

const kb_listDocs: Tool = {
  name: "kb_listDocs",
  description: "列出知识库中的全部文档（路径 + 标题 + 索引状态）。",
  parameters: z.object({}),
  execute: async () => {
    const docs: KbDocRow[] = await listKbDocs();
    if (docs.length === 0) return "知识库为空（尚未索引任何文档）";
    return docs
      .map((d, i) => `${i + 1}. ${d.path}${d.title !== d.path ? `（${d.title}）` : ""}[${d.index_status}]`)
      .join("\n");
  },
};

const kb_readDoc: Tool = {
  name: "kb_readDoc",
  description:
    "读取知识库中某篇文档的完整内容（path 取 kb_search / kb_listDocs 返回的路径）。内容超过 2 万字符时截断。",
  parameters: z.object({
    path: z.string().describe("文档绝对路径（来自 kb_search 或 kb_listDocs 的返回）"),
  }),
  execute: async (args) => {
    const full = await guardPath(String(args.path ?? ""));
    const text = await readTextFile(full);
    return text.length > 20_000 ? `${text.slice(0, 20_000)}\n…（已截断，全文 ${text.length} 字符）` : text;
  },
};

const kb_createDoc: Tool = {
  name: "kb_createDoc",
  description:
    "在知识库中创建一篇新文档（相对根目录的路径，自动补 .md），写入内容并立即索引。注意：创建类操作可直接执行，但若用户要求修改已有文档请用 kb_appendDoc 或先征求确认。",
  parameters: z.object({
    path: z.string().describe("相对知识库根目录的路径，如 notes/周报"),
    content: z.string().describe("Markdown 全文"),
  }),
  execute: async (args) => {
    const full = await createKbFile(await requireRoot(), String(args.path ?? "未命名"), String(args.content ?? ""));
    await indexFile(full);
    return `已创建并索引：${full}`;
  },
};

const kb_appendDoc: Tool = {
  name: "kb_appendDoc",
  description:
    "向知识库中已有文档追加内容（文件不存在则创建）。适合记录式追加（日记、速记）。追加后立即重新索引。修改类操作：若追加内容与用户原意不符，先复述确认。",
  parameters: z.object({
    path: z.string().describe("相对知识库根目录的路径，如 notes/日记"),
    content: z.string().describe("要追加的 Markdown 内容"),
  }),
  execute: async (args) => {
    const full = await appendKbFile(await requireRoot(), String(args.path ?? "未命名"), String(args.content ?? ""));
    await indexFile(full);
    return `已追加并重新索引：${full}`;
  },
};

async function requireRoot(): Promise<string> {
  const root = await kbRoot();
  if (!root) throw new Error("知识库尚未配置，请先在应用里选择知识库文件夹");
  return root;
}

export const kbTools: Record<string, Tool> = {
  kb_search,
  kb_listDocs,
  kb_readDoc,
  kb_createDoc,
  kb_appendDoc,
};
