import type { Module } from "../../kernel/module";
import schema from "./schema.sql?raw";
import { jobsTools } from "./tools";

/**
 * jobs 模块：求职监控（投递记录 + 状态机 + AI 创建/调整状态）。
 */
export const jobsModule: Module = {
  id: "jobs",
  name: "求职监控",
  migrations: [schema],
  tools: jobsTools,
  panels: [],
};
