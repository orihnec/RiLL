import type { Module } from "../../kernel/module";
import schema from "./schema.sql?raw";

/**
 * knowledge 模块：本地 Markdown 知识库（Obsidian 式），应用只存索引。
 * 增量索引（ingest.ts）随 M3 加入。
 */
export const kbModule: Module = {
  id: "knowledge",
  name: "知识库",
  migrations: [schema],
  panels: [],
};
