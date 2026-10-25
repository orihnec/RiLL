import type Database from "@tauri-apps/plugin-sql";
import type { Module } from "../../kernel/module";
import schema from "./schema.sql?raw";
import schemaV2 from "./schema-v2.sql?raw";
import schemaV3 from "./schema-v3.sql?raw";
import { scoutTools } from "./tools";

/**
 * scout 模块：校招信息库（抓取公开校招汇总数据 → 去重入库 → 多列检索筛选 + 与求职监控联动）。
 * 迁移顺序不可调整（scout:0/1 已在旧库应用过，新增迁移只能追加到末尾）。
 */
export const scoutModule: Module = {
  id: "scout",
  name: "校招信息库",
  migrations: [
    schema,
    schemaV2,
    {
      // ALTER 加列：列已存在则跳过（幂等重放保护）
      sql: schemaV3,
      skipIf: async (db: Database) => {
        const rows = await db.select<{ name: string }[]>(
          "SELECT name FROM pragma_table_info('campus_recruits')",
        );
        return rows.some((r) => r.name === "deadline_iso");
      },
    },
  ],
  tools: scoutTools,
  panels: [],
};
