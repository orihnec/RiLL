import type { Module } from "../../kernel/module";
import schema from "./schema.sql?raw";
import { kbTools } from "./tools";

/**
 * knowledge 模块：本地 Markdown 知识库（Obsidian 式），应用只存索引。
 * M3：增量索引（ingest.ts）+ 5 个 kb 工具 + 文档树 UI（KbDialog）。
 */
export const kbModule: Module = {
  id: "knowledge",
  name: "知识库",
  migrations: [schema],
  tools: kbTools,
  panels: [],
};
