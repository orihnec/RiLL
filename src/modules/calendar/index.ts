import type { Module } from "../../kernel/module";
import schema from "./schema.sql?raw";
import { calendarTools } from "./tools";

/**
 * calendar 模块：日程 CRUD / 空闲时段 / diff 记录 / Agent 工具 / RAG 摘要。
 */
export const calendarModule: Module = {
  id: "calendar",
  name: "日历",
  migrations: [schema],
  tools: calendarTools,
  panels: [],
};
