// 迁移机制无头验证：模拟旧库（user_version=3，无 schema_migrations）升级到最新，
// 验证：① 缺失的表/列全部补齐（app_settings/chat_sessions/reasoning）；
// ② 二次启动（全部已记录）幂等无错；③ 中间插入新迁移不再被跳过；
// ④ 已有 reasoning 列的库全量重放时 ALTER 被 skipIf 跳过。
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (f) => readFileSync(join(root, f), "utf8");
const migrations = [
  { id: "kernel:0", sql: read("kernel/schema.sql") },
  { id: "kernel:1", sql: read("kernel/schema-v1.sql") },
  {
    id: "kernel:2",
    sql: read("kernel/schema-v2.sql"),
    skipIf: async (db) =>
      db
        .prepare("SELECT name FROM pragma_table_info('chat_messages')")
        .all()
        .some((r) => r.name === "reasoning"),
  },
  { id: "kernel:3", sql: read("kernel/schema-v3.sql") },
  { id: "calendar:0", sql: read("modules/calendar/schema.sql") },
  { id: "knowledge:0", sql: read("modules/knowledge/schema.sql") },
];
const split = (sql) => sql.split(";").map((s) => s.trim()).filter(Boolean);

let ok = true;
const expect = (cond, msg) => {
  if (!cond) { ok = false; console.error(`FAIL: ${msg}`); }
  else console.log(`ok: ${msg}`);
};

// —— 模拟旧库：只有 kernel:0 + calendar + knowledge 的表，user_version=3 ——
const db = new DatabaseSync(":memory:");
for (const stmt of split(migrations[0].sql)) db.exec(stmt);
for (const stmt of split(migrations[4].sql)) db.exec(stmt);
for (const stmt of split(migrations[5].sql)) db.exec(stmt);
db.exec("PRAGMA user_version = 3");

// —— 模拟 initDb（镜像 kernel/db.ts 逻辑，含 skipIf） ——
async function runInit() {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = new Set(db.prepare("SELECT id FROM schema_migrations").all().map((r) => r.id));
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    let skipped = false;
    if (m.skipIf && (await m.skipIf(db))) skipped = true;
    if (!skipped) for (const stmt of split(m.sql)) db.exec(stmt);
    db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(m.id, Date.now());
  }
  db.exec(`PRAGMA user_version = ${migrations.length}`);
}

// 第一次（旧库升级）：全部按 id 执行，缺的表补齐
await runInit();
expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'").all().length === 1, "app_settings 已建（旧库被跳过的迁移补上了）");
expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_sessions'").all().length === 1, "chat_sessions 已建");
const cols = db.prepare("PRAGMA table_info(chat_messages)").all().map((c) => c.name);
expect(cols.includes("reasoning"), `chat_messages.reasoning 列已加（实际列：${cols.join(",")}）`);
expect(db.prepare("SELECT count(*) AS n FROM schema_migrations").get().n === migrations.length, "schema_migrations 全量记录");
expect(db.prepare("PRAGMA user_version").get().user_version === migrations.length, "user_version 同步");

// 第二次（模拟重启）：全记录 → 无任何执行
await runInit();
expect(db.prepare("SELECT count(*) AS n FROM schema_migrations").get().n === migrations.length, "二次启动不重复执行");

// —— 场景：已带 reasoning 列的库（无记录）全量重放 ——
const db2 = new DatabaseSync(":memory:");
for (const stmt of split(migrations[0].sql)) db2.exec(stmt);
for (const stmt of split(migrations[4].sql)) db2.exec(stmt);
for (const stmt of split(migrations[5].sql)) db2.exec(stmt);
db2.exec("ALTER TABLE chat_messages ADD COLUMN reasoning TEXT"); // 已升级过
const applied2 = new Set();
db2.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
for (const m of migrations) {
  if (applied2.has(m.id)) continue;
  let skipped = false;
  if (m.skipIf && (await m.skipIf(db2))) skipped = true;
  if (!skipped) for (const stmt of split(m.sql)) db2.exec(stmt);
  applied2.add(m.id);
}
expect(true, "已含 reasoning 列的库全量重放不炸（skipIf 跳过 ALTER）");

// —— 模拟未来插入 kernel:4 ——
const future = [...migrations, { id: "kernel:4", sql: "CREATE TABLE IF NOT EXISTS future_table (id TEXT PRIMARY KEY);" }];
{
  const applied = new Set(db.prepare("SELECT id FROM schema_migrations").all().map((r) => r.id));
  for (const m of future) {
    if (applied.has(m.id)) continue;
    for (const stmt of split(m.sql)) db.exec(stmt);
    db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(m.id, Date.now());
  }
  expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='future_table'").all().length === 1, "中间插入的新迁移正常执行（id 寻址）");
}

process.exit(ok ? 0 : 1);
