import Database from "@tauri-apps/plugin-sql";
import { appDataDir, join } from "@tauri-apps/api/path";

export interface Migration {
  id: string;
  sql: string;
}

let db: Database | null = null;

/**
 * 初始化数据库并执行迁移调度。
 * 迁移 = 按序应用、PRAGMA user_version 记账，幂等可重跑。
 */
export async function initDb(migrations: Migration[]): Promise<Database> {
  const dir = await appDataDir();
  const file = await join(dir, "riliagent.db");
  const database = await Database.load(`sqlite:${file}`);

  const rows = await database.select<{ user_version: number }[]>(
    "PRAGMA user_version",
  );
  let version = rows[0]?.user_version ?? 0;

  for (let i = version; i < migrations.length; i++) {
    const migration = migrations[i];
    for (const statement of splitStatements(migration.sql)) {
      await database.execute(statement);
    }
    await database.execute(`PRAGMA user_version = ${i + 1}`);
    console.info(`[db] applied migration ${migration.id} (v${i + 1})`);
  }

  db = database;
  return database;
}

/** 业务代码在初始化完成后获取连接。 */
export function getDb(): Database {
  if (!db) throw new Error("[db] not initialized — call initDb() first");
  return db;
}

/** 按分号切分 SQL 语句（DDL 专用，避免单条 prepare 执行多语句）。 */
function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
