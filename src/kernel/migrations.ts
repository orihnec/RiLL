import type Database from "@tauri-apps/plugin-sql";
import KERNEL_SCHEMA from "./schema.sql?raw";
import KERNEL_SCHEMA_V1 from "./schema-v1.sql?raw";
import KERNEL_SCHEMA_V2 from "./schema-v2.sql?raw";
import KERNEL_SCHEMA_V3 from "./schema-v3.sql?raw";
import KERNEL_SCHEMA_V4 from "./schema-v4.sql?raw";
import KERNEL_SCHEMA_V5 from "./schema-v5.sql?raw";
import KERNEL_SCHEMA_V6 from "./schema-v6.sql?raw";
import KERNEL_SCHEMA_V7 from "./schema-v7.sql?raw";

/** 内核级迁移（RAG 核心 / 自迭代 / 会话 / 设置 / 多供应商 / 协议）。按序应用，稳定 id 寻址。 */
export const kernelMigrations: { id: string; sql: string; skipIf?: (db: Database) => Promise<boolean> }[] = [
  { id: "kernel:0", sql: KERNEL_SCHEMA },
  { id: "kernel:1", sql: KERNEL_SCHEMA_V1 },
  {
    id: "kernel:2",
    sql: KERNEL_SCHEMA_V2,
    // SQLite 无 ADD COLUMN IF NOT EXISTS：列已存在则跳过（幂等重放保护）
    skipIf: async (db) => {
      const rows = await db.select<{ name: string }[]>(
        "SELECT name FROM pragma_table_info('chat_messages')",
      );
      return rows.some((r) => r.name === "reasoning");
    },
  },
  { id: "kernel:3", sql: KERNEL_SCHEMA_V3 },
  { id: "kernel:4", sql: KERNEL_SCHEMA_V4 },
  { id: "kernel:5", sql: KERNEL_SCHEMA_V5 },
  {
    id: "kernel:6",
    sql: KERNEL_SCHEMA_V6,
    skipIf: async (db) => {
      const rows = await db.select<{ name: string }[]>(
        "SELECT name FROM pragma_table_info('llm_providers')",
      );
      return rows.some((r) => r.name === "protocol");
    },
  },
  {
    id: "kernel:7",
    sql: KERNEL_SCHEMA_V7,
    skipIf: async (db) => {
      const rows = await db.select<{ name: string }[]>(
        "SELECT name FROM pragma_table_info('chat_messages')",
      );
      return rows.some((r) => r.name === "attachments_json");
    },
  },
];
