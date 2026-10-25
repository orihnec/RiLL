import type Database from "@tauri-apps/plugin-sql";
import type { Module } from "../../kernel/module";
import schema from "./schema.sql?raw";
import schemaV2 from "./schema-v2.sql?raw";
import schemaV3 from "./schema-v3.sql?raw";
import schemaV4 from "./schema-v4.sql?raw";
import schemaV5 from "./schema-v5.sql?raw";
import schemaV6 from "./schema-v6.sql?raw";
import { mailTools } from "./tools";

/**
 * mail 模块：邮箱（IMAP 读信 + 本地化 + 会话合并 + 新邮件提醒 + AI 排程）。
 *
 * M1「能连能看」：账号管理、文件夹、邮件列表/详情、附件、新邮件提醒。
 * M2「能用」：会话合并（像聊天一样）、已读/星标/删除/移动、正文预取、会话级搜索。
 * M3「AI 排程」：AI 从邮件里识别面试/笔试/截止 → **待确认候选** → 用户确认才写日历（extract.ts）。
 *
 * 读信走 Rust 侧自实现的 IMAP（src-tauri/src/mail.rs）——TCP+TLS，webview 的 JS 碰不到。
 */
export const mailModule: Module = {
  id: "mail",
  name: "邮箱",
  migrations: [
    schema,
    {
      // ALTER 加列（notify / notify_interval）：列已存在则跳过（幂等重放保护）
      sql: schemaV2,
      skipIf: async (db: Database) => {
        const rows = await db.select<{ name: string }[]>(
          "SELECT name FROM pragma_table_info('mail_accounts')",
        );
        return rows.some((r) => r.name === "notify");
      },
    },
    {
      // ALTER 加列（references_json / in_reply_to / thread_id）：同上
      sql: schemaV3,
      skipIf: async (db: Database) => {
        const rows = await db.select<{ name: string }[]>(
          "SELECT name FROM pragma_table_info('mail_messages')",
        );
        return rows.some((r) => r.name === "thread_id");
      },
    },
    // 会话自愈用的部分索引（CREATE INDEX IF NOT EXISTS 幂等，不需要 skipIf）
    schemaV4,
    {
      // AI 排程：mail_messages.ai_analyzed_at + mail_extractions 表
      sql: schemaV5,
      skipIf: async (db: Database) => {
        const rows = await db.select<{ name: string }[]>(
          "SELECT name FROM pragma_table_info('mail_messages')",
        );
        return rows.some((r) => r.name === "ai_analyzed_at");
      },
    },
    {
      // 实时接收：mail_accounts.watch_interval（秒）
      sql: schemaV6,
      skipIf: async (db: Database) => {
        const rows = await db.select<{ name: string }[]>(
          "SELECT name FROM pragma_table_info('mail_accounts')",
        );
        return rows.some((r) => r.name === "watch_interval");
      },
    },
  ],
  tools: mailTools,
  panels: [],
};
