// 校验全部 schema/迁移 SQL 语法与关键逻辑（node:sqlite 内置，无需联网）。
// 按迁移顺序执行（v1/v2/v3 依赖前序表），末尾做 rollback 冒烟。
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const files = [
  "kernel/schema.sql",
  "kernel/schema-v1.sql",
  "kernel/schema-v2.sql",
  "kernel/schema-v3.sql",
  "modules/calendar/schema.sql",
  "modules/knowledge/schema.sql",
];

const db = new DatabaseSync(":memory:");
let ok = true;
for (const rel of files) {
  const sql = readFileSync(join(root, rel), "utf8");
  try {
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      db.exec(stmt);
    }
    console.log(`OK   ${rel}`);
  } catch (e) {
    ok = false;
    console.error(`FAIL ${rel}: ${e.message}`);
  }
}

// 冒烟：事件 + FTS5 + 会话回退
try {
  db.exec(
    "INSERT INTO events (id,title,start_at,end_at,all_day,category,created_at,updated_at) VALUES ('e1','测试',0,3600000,0,'default',0,0)",
  );
  const row = db.prepare("SELECT title FROM events WHERE id='e1'").get();
  console.log(`SMOKE events: ${JSON.stringify(row)}`);
  db.exec("INSERT INTO memories_fts (content, source) VALUES ('hello world', 'test')");
  const hit = db
    .prepare("SELECT count(*) AS n FROM memories_fts WHERE memories_fts MATCH 'hello'")
    .get();
  console.log(`SMOKE fts5: ${JSON.stringify(hit)}`);
  // 会话回退：插 4 条消息，回退到第 2 条
  db.exec("INSERT INTO chat_sessions (id,title,created_at,updated_at) VALUES ('s1','会话',0,0)");
  db.exec(`
    INSERT INTO chat_messages (id,session_id,role,content,created_at) VALUES
      ('m1','s1','user','你好',1),
      ('m2','s1','assistant','你好！',2),
      ('m3','s1','user','再问',3),
      ('m4','s1','assistant','回答',4);
  `);
  db.exec(
    `DELETE FROM chat_messages
     WHERE session_id = 's1' AND rowid > (SELECT rowid FROM chat_messages WHERE id = 'm2')`,
  );
  const left = db.prepare("SELECT count(*) AS n FROM chat_messages WHERE session_id='s1'").get();
  console.log(`SMOKE rollback: ${JSON.stringify(left)}（应 2）`);
  if (left.n !== 2) ok = false;
  // 搜索（node:sqlite 用 ? 位置参数；应用层 rusqlite 的 $1 不受影响）
  const found = db
    .prepare(
      `SELECT m.id FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id
       WHERE instr(m.content, ?) > 0`,
    )
    .all("再问");
  console.log(`SMOKE search: ${JSON.stringify(found)}（应为空，已被回退删除）`);
  if (found.length !== 0) ok = false;
} catch (e) {
  ok = false;
  console.error(`SMOKE FAIL: ${e.message}`);
}

process.exit(ok ? 0 : 1);
