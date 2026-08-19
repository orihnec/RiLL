import KERNEL_SCHEMA from "./schema.sql?raw";
import KERNEL_SCHEMA_V1 from "./schema-v1.sql?raw";

/** 内核级迁移（RAG 核心 / 自迭代 / 会话 / 设置）。按序应用，PRAGMA user_version 记账。 */
export const kernelMigrations: { id: string; sql: string }[] = [
  { id: "kernel:0", sql: KERNEL_SCHEMA },
  { id: "kernel:1", sql: KERNEL_SCHEMA_V1 },
];
