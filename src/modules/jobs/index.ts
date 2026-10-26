import type { Module } from "../../kernel/module";
import schema from "./schema.sql?raw";
import dateKnown from "./schema-v2.sql?raw";
import revision from "./schema-v3.sql?raw";
import extras from "./schema-v4.sql?raw";
import imports from "./schema-v5.sql?raw";
import { backupBeforeImportMigration, hasJobColumn } from "./import/migrations";
import { jobsTools } from "./tools";

/**
 * jobs 模块：求职监控（投递记录 + 状态机 + AI 创建/调整状态）。
 */
export const jobsModule: Module = {
  id: "jobs",
  name: "求职监控",
  migrations: [schema,
    { sql: dateKnown, skipIf: backupBeforeImportMigration },
    { sql: revision, skipIf: (db) => hasJobColumn(db, "revision") },
    { sql: extras, skipIf: (db) => hasJobColumn(db, "extras_json") },
    imports,
  ],
  tools: jobsTools,
  panels: [],
};
