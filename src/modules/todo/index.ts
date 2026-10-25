import type { Module } from "../../kernel/module";
import schema from "./schema.sql?raw";
import { todoTools } from "./tools";

/**
 * todo 模块：待办清单（可与日程绑定，悬浮窗显示今日待办）。
 */
export const todoModule: Module = {
  id: "todo",
  name: "待办",
  migrations: [schema],
  tools: todoTools,
  panels: [],
};
