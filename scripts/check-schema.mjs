// 校验各 schema.sql 的 SQL 语法（node:sqlite 内置，无需联网）。
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const files = [
  "kernel/schema.sql",
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

// 冒烟：插入/查询一条事件 + FTS 表存在性
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
} catch (e) {
  ok = false;
  console.error(`SMOKE FAIL: ${e.message}`);
}

process.exit(ok ? 0 : 1);
