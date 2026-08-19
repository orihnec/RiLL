// RRULE 展开 + 例外（exdate/override）逻辑的无头验证（node:sqlite 模拟数据流）。
import { DatabaseSync } from "node:sqlite";
import pkg from "rrule";
const { RRule } = pkg;

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE events (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT,
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0, category TEXT NOT NULL DEFAULT 'default',
  rrule TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE event_exdates (event_id TEXT NOT NULL, exdate_ms INTEGER NOT NULL, PRIMARY KEY(event_id, exdate_ms));
CREATE TABLE event_overrides (
  id TEXT PRIMARY KEY, master_id TEXT NOT NULL, original_start_ms INTEGER NOT NULL,
  title TEXT, notes TEXT, start_ms INTEGER, end_ms INTEGER, all_day INTEGER, category TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
`);

// ---- 与 service.ts 相同的展开逻辑（镜像实现，防止 Tauri 依赖） ----
function occurrenceAt(row, originalStart) {
  const dur = row.end_at - row.start_at;
  return { id: `${row.id}@${originalStart}`, title: row.title, startAt: originalStart, endAt: originalStart + dur, rrule: row.rrule, originalStart, isOccurrence: true };
}
function overrideToOccurrence(row, ov) {
  const baseDur = row.end_at - row.start_at;
  const startAt = ov.start_ms ?? ov.original_start_ms;
  const endAt = ov.end_ms ?? (ov.start_ms != null ? startAt + baseDur : ov.original_start_ms + baseDur);
  return { id: `${row.id}@${ov.original_start_ms}`, title: ov.title ?? row.title, startAt, endAt, originalStart: ov.original_start_ms, isOccurrence: true };
}
function expandRecurring(row, rangeStart, rangeEnd, exdates, overrides) {
  const WEEKDAY_MAP = { SU: RRule.SU, MO: RRule.MO, TU: RRule.TU, WE: RRule.WE, TH: RRule.TH, FR: RRule.FR, SA: RRule.SA };
  const FREQ_MAP = { YEARLY: RRule.YEARLY, MONTHLY: RRule.MONTHLY, WEEKLY: RRule.WEEKLY, DAILY: RRule.DAILY, HOURLY: RRule.HOURLY, MINUTELY: RRule.MINUTELY, SECONDLY: RRule.SECONDLY };
  const opts = {};
  for (const part of row.rrule.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const [k, v] = [part.slice(0, eq), part.slice(eq + 1)];
    switch (k) {
      case "FREQ": opts.freq = FREQ_MAP[v] ?? RRule.WEEKLY; break;
      case "INTERVAL": opts.interval = Number(v); break;
      case "COUNT": opts.count = Number(v); break;
      case "UNTIL": opts.until = new Date(v.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/, "$1-$2-$3T$4:$5:$6$7")); break;
      case "BYDAY": opts.byweekday = v.split(",").map((d) => WEEKDAY_MAP[d] ?? RRule.MO); break;
      case "BYMONTHDAY": opts.bymonthday = v.split(",").map(Number); break;
    }
  }
  const rule = new RRule({ ...opts, dtstart: new Date(row.start_at) });
  const out = [];
  const emitted = new Set();
  for (const dt of rule.between(new Date(rangeStart), new Date(rangeEnd), true)) {
    const origStart = dt.getTime();
    if (exdates.has(origStart)) continue;
    emitted.add(origStart);
    const ov = overrides.get(origStart);
    out.push(ov ? overrideToOccurrence(row, ov) : occurrenceAt(row, origStart));
  }
  for (const ov of overrides.values()) {
    if (emitted.has(ov.original_start_ms)) continue;
    const o = overrideToOccurrence(row, ov);
    if (o.startAt < rangeEnd && o.endAt > rangeStart) out.push(o);
  }
  return out.sort((a, b) => a.startAt - b.startAt);
}

// ---- 测试数据：每周一 10:00-11:00，重复 4 次后截止 ----
const DAY = 86_400_000;
const monday = new Date("2025-06-02T10:00:00").getTime(); // 2025-06-02 是周一
const master = {
  id: "m1", title: "周会", notes: null,
  start_at: monday, end_at: monday + 3_600_000,
  all_day: 0, category: "meeting",
  rrule: "FREQ=WEEKLY;COUNT=4",
};
db.prepare("INSERT INTO events (id,title,notes,start_at,end_at,all_day,category,rrule,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
  .run(master.id, master.title, master.notes, master.start_at, master.end_at, master.all_day, master.category, master.rrule, 0, 0);

// 例外 1：删除第 2 次（6/9）
const exdate = monday + DAY * 7;
db.prepare("INSERT INTO event_exdates (event_id, exdate_ms) VALUES (?,?)").run("m1", exdate);

// 例外 2：第 3 次（6/16）改到周二 14:00，标题改「周会·改期」
const orig3 = monday + DAY * 14;
db.prepare("INSERT INTO event_exdates (event_id, exdate_ms) VALUES (?,?)").run("m1", orig3);
db.prepare("INSERT INTO event_overrides (id,master_id,original_start_ms,title,notes,start_ms,end_ms,all_day,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
  .run("o1", "m1", orig3, "周会·改期", null, orig3 + DAY + 4 * 3_600_000, orig3 + DAY + 5 * 3_600_000, null, null, 0, 0);

// ---- 测试 2：BYDAY + INTERVAL（每两周 周一/周四） ----
const m2start = new Date("2025-06-02T09:00:00").getTime();
db.prepare("INSERT INTO events (id,title,notes,start_at,end_at,all_day,category,rrule,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
  .run("m2", "隔周例会", null, m2start, m2start + 3_600_000, 0, "work", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH", 0, 0);

// ---- 测试 3：DAILY + UNTIL（每天 8 点，到 6/5） ----
const m3start = new Date("2025-06-02T08:00:00").getTime();
db.prepare("INSERT INTO events (id,title,notes,start_at,end_at,all_day,category,rrule,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
  .run("m3", "晨练", null, m3start, m3start + 1_800_000, 0, "health", "FREQ=DAILY;UNTIL=20250605T235959Z", 0, 0);

// ---- 查询 6/2 ~ 6/30 ----
const rangeStart = new Date("2025-06-02T00:00:00").getTime();
const rangeEnd = new Date("2025-06-30T00:00:00").getTime();
const rows = db.prepare("SELECT * FROM events WHERE deleted_at IS NULL").all();
const ids = rows.map((r) => r.id);
const exdates = new Map();
for (const r of db.prepare(`SELECT event_id, exdate_ms FROM event_exdates WHERE event_id IN (${ids.map(() => "?").join(",")})`).all(...ids)) {
  if (!exdates.has(r.event_id)) exdates.set(r.event_id, new Set());
  exdates.get(r.event_id).add(r.exdate_ms);
}
const overrides = new Map();
for (const r of db.prepare(`SELECT * FROM event_overrides WHERE master_id IN (${ids.map(() => "?").join(",")})`).all(...ids)) {
  if (!overrides.has(r.master_id)) overrides.set(r.master_id, new Map());
  overrides.get(r.master_id).set(r.original_start_ms, r);
}

const out = [];
for (const row of rows) {
  if (!row.rrule) continue;
  out.push(...expandRecurring(row, rangeStart, rangeEnd, exdates.get(row.id) ?? new Set(), overrides.get(row.id) ?? new Map()));
}

console.log("occurrences:", out.map((o) => ({ title: o.title, start: new Date(o.startAt).toString().slice(0, 24), id: o.id })));

let ok = true;
const expect = (cond, msg) => {
  if (!cond) { ok = false; console.error(`FAIL: ${msg}`); }
  else console.log(`ok: ${msg}`);
};

const m1 = out.filter((o) => o.id.startsWith("m1@"));
expect(m1.length === 3, `m1 共 3 次（4 次 - 1 删除 - 1 改期替换），实际 ${m1.length}`);
expect(m1.some((o) => o.startAt === monday), "m1 第 1 次正常");
expect(!m1.some((o) => o.startAt === exdate), "m1 第 2 次被 EXDATE 排除");
expect(!m1.some((o) => o.originalStart === orig3 && o.startAt === orig3), "m1 第 3 次原时间被替换");
const moved = m1.find((o) => o.originalStart === orig3);
expect(!!moved && moved.title === "周会·改期" && moved.startAt === orig3 + DAY + 4 * 3_600_000, `m1 第 3 次按 override 显示（${moved?.title} @ ${moved ? new Date(moved.startAt).toString().slice(0, 24) : "?"}）`);
expect(m1.some((o) => o.startAt === monday + DAY * 21), "m1 第 4 次正常");

// m2: 6/2(一), 6/5(四), 6/16(一), 6/19(四)
const m2 = out.filter((o) => o.masterId === "m2" || o.id.startsWith("m2@"));
expect(m2.length === 4, `m2 BYDAY+INTERVAL 共 4 次（每两周周一/周四），实际 ${m2.length}`);
expect(m2.some((o) => o.startAt === m2start), "m2 第 1 次（6/2 周一）");
expect(m2.some((o) => o.startAt === m2start + 3 * DAY), "m2 第 2 次（6/5 周四）");
expect(m2.some((o) => o.startAt === m2start + 14 * DAY), "m2 第 3 次（6/16 周一）");
expect(m2.some((o) => o.startAt === m2start + 17 * DAY), "m2 第 4 次（6/19 周四）");
expect(!m2.some((o) => o.startAt === m2start + 7 * DAY), "m2 6/9 应被间隔跳过");

// m3: 6/2 ~ 6/5 每天 8:00（UNTIL 20250605T235959Z）
const m3 = out.filter((o) => o.id.startsWith("m3@"));
expect(m3.length === 4, `m3 DAILY+UNTIL 共 4 次（6/2-6/5），实际 ${m3.length}`);
expect(m3.every((o) => new Date(o.startAt).getHours() === 8), "m3 全部在 8:00");
expect(!m3.some((o) => o.startAt >= m3start + 4 * DAY), "m3 6/6 之后不再出现");

process.exit(ok ? 0 : 1);
