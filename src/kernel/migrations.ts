import KERNEL_SCHEMA from "./schema.sql?raw";

/** 内核级迁移（RAG 核心 / 自迭代 / 会话）。 */
export const kernelMigrations: { id: string; sql: string }[] = [
  { id: "kernel:0", sql: KERNEL_SCHEMA },
];
