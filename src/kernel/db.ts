import Database from "@tauri-apps/plugin-sql";
import { appDataDir, join } from "@tauri-apps/api/path";

export interface Migration {
  id: string;
  sql: string;
  /** 返回 true 时跳过执行（如 ALTER 类迁移的目标列已存在）；跳过也会记账。 */
  skipIf?: (db: Database) => Promise<boolean>;
}

let db: Database | null = null;

/**
 * 初始化数据库并执行迁移调度。
 *
 * 迁移寻址 = 稳定 id（schema_migrations 表记录已应用集合），而不是
 * PRAGMA user_version 的数量对齐——数量机制在往迁移数组中间插入新迁移时
 * 会让旧库跳过新迁移（历史教训：app_settings/chat_sessions 曾因此从未建表）。
 * 除 ALTER 类迁移（用 skipIf 幂等）外，其余 SQL 均用 IF NOT EXISTS / OR IGNORE，
 * 旧库首次启用记录机制时会全量重放，无害。
 */
export async function initDb(migrations: Migration[]): Promise<Database> {
  const dir = await appDataDir();
  const file = await join(dir, "riliagent.db");
  const database = await Database.load(`sqlite:${file}`);

  await database.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const appliedRows = await database.select<{ id: string }[]>(
    "SELECT id FROM schema_migrations",
  );
  const applied = new Set(appliedRows.map((r) => r.id));

  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    if (m.skipIf && (await m.skipIf(database))) {
      console.info(`[db] skip migration ${m.id} (condition met)`);
    } else {
      for (const statement of splitStatements(m.sql)) {
        try {
          await database.execute(statement);
        } catch (e) {
          // ALTER ... ADD COLUMN 的列已经存在：
          // 说明上次跑到这一步后进程被杀、记账没写进去（首次启动最常见）。
          // 列已在目标状态，继续执行并记账即可，否则旧库会永远卡在启动失败。
          if (/duplicate column name/i.test(String(e))) {
            console.warn(`[db] ${m.id}: 列已存在，跳过该语句`);
            continue;
          }
          throw e;
        }
      }
    }
    // OR IGNORE：并发实例同时迁移时防 UNIQUE 冲突（另一实例已记账则静默跳过）
    await database.execute(
      "INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ($1, $2)",
      [m.id, Date.now()],
    );
    applied.add(m.id); // 防御迁移数组内出现重复 id
    console.info(`[db] applied migration ${m.id}`);
  }

  // 兼容保留：供外部工具/诊断读取
  await database.execute(`PRAGMA user_version = ${migrations.length}`);

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
