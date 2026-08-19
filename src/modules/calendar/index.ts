import type { Module } from "../../kernel/module";
import schema from "./schema.sql?raw";

/**
 * calendar 模块：日程 CRUD / 空闲时段 / diff 记录 / Agent 工具 / RAG 摘要。
 * M1 提供 migrations + 面板；工具（tools.ts）随 M2 加入。
 */
export const calendarModule: Module = {
  id: "calendar",
  name: "日历",
  migrations: [schema],
  panels: [],
};
