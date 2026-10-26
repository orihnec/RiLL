import assert from "node:assert/strict";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true, entries: [] }, server: { middlewareMode: true, watch: { ignored: ["**/*"] } } });
after(() => server.close());
const load = name => server.ssrLoadModule(`/src/modules/interviews/${name}.ts`);
const { createInterviewRepository } = await load("repository");
const { newSession, newQuestion, parseTags, matchesQuery, validDate, sameContent } = await load("model");
const { exportMarkdown, exportFilename } = await load("markdown");
const { Autosave } = await load("autosave");
const { createDraftJournal } = await load("journal");
const schema = readFileSync(new URL("../src/modules/interviews/schema.sql", import.meta.url), "utf8");
const jobSchema = readFileSync(new URL("../src/modules/jobs/schema.sql", import.meta.url), "utf8");
function database(filename = ":memory:") {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec(jobSchema); sqlite.exec(schema);
  const statement = (sql, values = []) => { const stmt = sqlite.prepare(sql); stmt.setAllowUnknownNamedParameters(true); return { stmt, params: Object.fromEntries(values.map((v, i) => [`$${i + 1}`, v])) }; };
  const adapter = {
    async execute(sql, values) { const { stmt, params } = statement(sql, values); return { rowsAffected: Number(stmt.run(params).changes) }; },
    async select(sql, values) { const { stmt, params } = statement(sql, values); return stmt.all(params); },
  };
  return { sqlite, repo: createInterviewRepository(adapter), close: () => sqlite.close() };
}
function memoryStorage() {
  const values = new Map();
  return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const fixtureJob = { id: "job-one", company: "示例公司", position: "研发工程师" };

test("新迁移可重放，既有投递和未知面试日期均保留", async () => {
  const db = database();
  try {
    db.sqlite.exec("INSERT INTO job_applications(id,company,position,created_at,updated_at,applied_at) VALUES ('job-one','示例公司','研发工程师',1,1,1)");
    const s = await db.repo.createSession(newSession("s1", fixtureJob));
    db.sqlite.exec(schema);
    assert.equal(s.interviewDate, null); assert.equal(s.rawNotes, "");
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM job_applications").get().n, 1);
    assert.equal((await db.repo.list()).sessions.length, 1);
  } finally { db.close(); }
});
test("独立速记允许公司岗位留空；相同创建请求不会重复插入", async () => {
  const db = database();
  try {
    const s = { ...newSession("s1"), rawNotes: "原始速记\n问题：闭包？" };
    await db.repo.createSession(s); await db.repo.createSession(s);
    const rows = (await db.repo.list()).sessions;
    assert.equal(rows.length, 1); assert.equal(rows[0].company, ""); assert.equal(rows[0].rawNotes, s.rawNotes);
    await assert.rejects(() => db.repo.createSession({ ...s, company: "另一个公司" }), /编号已被使用/);
  } finally { db.close(); }
});
test("面经关联保留公司岗位快照，删除原投递不删除面经和问题", async () => {
  const db = database();
  try {
    db.sqlite.exec("INSERT INTO job_applications(id,company,position,created_at,updated_at,applied_at) VALUES ('job-one','示例公司','研发工程师',1,1,1)");
    const s = await db.repo.createSession(newSession("s1", fixtureJob));
    await db.repo.createQuestion("q1", s.id);
    db.sqlite.exec("DELETE FROM job_applications WHERE id='job-one'");
    const data = await db.repo.list();
    assert.equal(data.sessions[0].company, fixtureJob.company); assert.equal(data.sessions[0].jobId, fixtureJob.id); assert.equal(data.questions.length, 1);
  } finally { db.close(); }
});
test("原回答、参考答案和复盘分开保存，同题多场次保持独立", async () => {
  const db = database();
  try {
    await db.repo.createSession(newSession("s1")); await db.repo.createSession(newSession("s2"));
    const a = await db.repo.createQuestion("q1", "s1"), b = await db.repo.createQuestion("q2", "s2");
    await db.repo.save("question", { ...a, prompt: "解释闭包", answer: "当时的回答", referenceAnswer: "改进后的回答", reflection: "缺少场景", tags: ["JavaScript"], mastery: "needs_work" });
    await db.repo.save("question", { ...b, prompt: "解释闭包", answer: "另一轮的回答" });
    const data = await db.repo.list();
    assert.equal(data.questions[0].answer, "当时的回答"); assert.equal(data.questions[0].referenceAnswer, "改进后的回答");
    assert.equal(data.questions[1].answer, "另一轮的回答"); assert.equal(data.questions[0].revision, 1);
  } finally { db.close(); }
});
test("并发添加问题时顺序独立分配，重复请求保持同一 ID", async () => {
  const db = database();
  try {
    await db.repo.createSession(newSession("s1"));
    const values = await Promise.all(["q1", "q2", "q3"].map(id => db.repo.createQuestion(id, "s1")));
    assert.deepEqual(values.map(q => q.sortOrder), [0, 1, 2]);
    assert.equal((await db.repo.createQuestion("q2", "s1")).sortOrder, 1); assert.equal((await db.repo.list()).questions.length, 3);
  } finally { db.close(); }
});
test("revision 拒绝过时编辑，保留另一窗口的内容", async () => {
  const db = database();
  try {
    const s = await db.repo.createSession(newSession("s1"));
    const saved = await db.repo.save("session", { ...s, rawNotes: "另一窗口的新内容" });
    await assert.rejects(() => db.repo.save("session", { ...s, rawNotes: "旧窗口的修改" }), /其他窗口/);
    assert.equal((await db.repo.read("session", s.id)).rawNotes, saved.rawNotes);
  } finally { db.close(); }
});
test("写入已提交但响应丢失时重试，不重复递增 revision", async () => {
  const db = database();
  try {
    const s = await db.repo.createSession(newSession("s1")), draft = { ...s, summary: "复盘" };
    await db.repo.save("session", draft);
    const retry = await db.repo.save("session", draft);
    assert.equal(retry.revision, 1); assert.equal(retry.summary, "复盘");
  } finally { db.close(); }
});
test("场次移入回收站后禁止新增/改题，恢复后原文和问题仍在", async () => {
  const db = database();
  try {
    const s = await db.repo.createSession({ ...newSession("s1"), rawNotes: "不能丢失的原文" });
    const q = await db.repo.createQuestion("q1", s.id);
    const removed = await db.repo.setDeleted("session", s, true);
    await assert.rejects(() => db.repo.createQuestion("q2", s.id), /回收站/);
    await assert.rejects(() => db.repo.save("question", { ...q, answer: "新回答" }), /回收站/);
    const restored = await db.repo.setDeleted("session", removed, false);
    assert.equal(restored.rawNotes, s.rawNotes); assert.equal(restored.revision, 2);
    assert.equal((await db.repo.list()).questions.length, 1);
  } finally { db.close(); }
});
test("题目软删除可恢复，旧编辑不能覆盖删除状态", async () => {
  const db = database();
  try {
    await db.repo.createSession(newSession("s1")); const q = await db.repo.createQuestion("q1", "s1");
    const removed = await db.repo.setDeleted("question", q, true);
    await assert.rejects(() => db.repo.save("question", { ...q, prompt: "过时修改" }), /回收站/);
    const restored = await db.repo.setDeleted("question", removed, false);
    assert.equal(restored.deletedAt, null); assert.equal(restored.revision, 2);
  } finally { db.close(); }
});
test("日期、标签、掌握程度校验失败不写库，SQL 值全部参数化", async () => {
  const db = database();
  try {
    const s = await db.repo.createSession(newSession("s1"));
    await assert.rejects(() => db.repo.save("session", { ...s, interviewDate: "2026-02-30" }), /日期/);
    const q = await db.repo.createQuestion("q1", s.id);
    await assert.rejects(() => db.repo.save("question", { ...q, tags: Array.from({ length: 21 }, (_, i) => `tag${i}`) }), /20/);
    const literal = "'; DROP TABLE interview_questions; --";
    await db.repo.save("session", { ...s, title: literal });
    assert.equal((await db.repo.read("session", s.id)).title, literal); assert.equal((await db.repo.list()).questions.length, 1);
    assert.equal(validDate("2024-02-29"), true); assert.equal(validDate("2026-02-29"), false);
  } finally { db.close(); }
});
test("本地搜索覆盖中文、代码和多个关键词，标签去重保留有空格的词组", () => {
  assert.deepEqual(parseTags("React，闭包,react; 系统设计、React Hooks"), ["React", "闭包", "系统设计", "React Hooks"]);
  assert.equal(matchesQuery("示例 useEffect", "示例公司", "说明 useEffect 的依赖"), true);
  assert.equal(matchesQuery("示例 数据库", "示例公司", "闭包"), false);
});
test("Markdown 导出保留代码、换行和未知日期，排除移除题及其他面经", () => {
  const s = { ...newSession("s1"), title: "面经\n# 标题", company: "A|B", rawNotes: "原文\n```ts\nconst x = 1;\n```" };
  const q = { ...newQuestion("q1", s.id, 0), prompt: "问题\n追问", answer: "当时回答", referenceAnswer: "参考\n```js\nlet x;\n```", reflection: "复盘" };
  const text = exportMarkdown(s, [q, { ...q, id: "q2", deletedAt: 100, answer: "已移除内容" }, { ...q, id: "q3", sessionId: "other", answer: "其他面经" }]);
  assert.ok(text.includes(s.rawNotes)); assert.ok(text.includes(q.referenceAnswer)); assert.ok(text.includes("面试日期：未填写"));
  assert.ok(text.includes("当时回答") && text.includes("参考") && text.includes("复盘"));
  assert.equal(text.includes("已移除内容"), false); assert.equal(text.includes("其他面经"), false);
  assert.equal(/[<>:"/\\|?*\r\n]/.test(exportFilename(s)), false);
});
test("保存中继续输入，旧响应只推进版本，最终完整落库", async () => {
  const db = database(), gate = deferred(); let calls = 0, journal = null;
  try {
    const s = await db.repo.createSession(newSession("s1"));
    const saver = new Autosave(s, { delay: 60_000, save: async value => { if (++calls === 1) await gate.promise; return db.repo.save("session", value); }, journal: value => { journal = value; }, changed() {} });
    saver.patch({ rawNotes: "第一段" }); const flushing = saver.flush();
    saver.patch({ rawNotes: "第一段\n保存过程中继续输入的第二段" });
    gate.resolve(); await flushing;
    assert.equal(calls, 2); assert.equal(saver.value.revision, 2); assert.equal((await db.repo.read("session", s.id)).rawNotes, saver.value.rawNotes);
    assert.equal(saver.status.dirty, false); assert.equal(journal, null);
  } finally { db.close(); }
});
test("保存失败保留草稿，继续编辑不隐藏错误，手动重试保存最新内容", async () => {
  let failing = true, journal = null;
  const saver = new Autosave(newSession("s1"), { delay: 60_000, save: async value => { if (failing) throw new Error("模拟写入失败"); return { ...value, revision: value.revision + 1 }; }, journal: value => { journal = value; }, changed() {} });
  saver.patch({ rawNotes: "需要保留的内容" }); await assert.rejects(() => saver.flush(), /模拟写入失败/);
  saver.patch({ rawNotes: "失败后继续编辑" });
  assert.match(saver.status.error, /模拟写入失败/); assert.equal(journal.rawNotes, "失败后继续编辑");
  failing = false; await saver.flush(); assert.equal(saver.status.dirty, false); assert.equal(saver.status.error, null); assert.equal(journal, null);
});
test("远端刷新不能覆盖未保存修改，版本冲突仍保留可导出的草稿", async () => {
  const db = database(); let journal;
  try {
    const s = await db.repo.createSession(newSession("s1"));
    const saver = new Autosave(s, { delay: 60_000, save: value => db.repo.save("session", value), journal: value => { journal = value; }, changed() {} });
    saver.patch({ rawNotes: "本地修改" }); const remote = await db.repo.save("session", { ...s, rawNotes: "远端修改" });
    saver.accept(remote); assert.equal(saver.value.rawNotes, "本地修改");
    await assert.rejects(() => saver.flush(), /其他窗口/); assert.equal(journal.rawNotes, "本地修改");
    assert.ok(exportMarkdown(saver.value, []).includes("本地修改"));
    saver.discard(remote); assert.equal(saver.value.rawNotes, "远端修改"); assert.equal(journal, null);
  } finally { db.close(); }
});

test("恢复草稿空间不足不阻止数据库保存，旧刷新也不能回退已保存版本", async () => {
  const db = database();
  try {
    const s = await db.repo.createSession(newSession("s1"));
    const saver = new Autosave(s, { delay: 60_000, save: value => db.repo.save("session", value), journal: value => { if (value) throw new Error("quota"); }, changed() {} });
    saver.patch({ rawNotes: "空间不足时仍应落库" });
    assert.match(saver.status.error, /草稿空间不足/);
    await saver.flush();
    assert.equal((await db.repo.read("session", s.id)).rawNotes, "空间不足时仍应落库");
    assert.equal(saver.status.error, null);
    saver.accept(s);
    assert.equal(saver.value.revision, 1); assert.equal(saver.value.rawNotes, "空间不足时仍应落库");
  } finally { db.close(); }
});
test("重开后的恢复草稿保留 Unicode 和代码，各窗口草稿互不覆盖", () => {
  const storage = memoryStorage(), a = createDraftJournal(storage, "window-a"), b = createDraftJournal(storage, "window-b");
  const s = { ...newSession("s1"), rawNotes: "中文😀\n```ts\nconst x = 1;\n```" };
  a.write("session", s.id, s); b.write("session", s.id, { ...s, rawNotes: "另一窗口" });
  const reopened = createDraftJournal(storage, "new-window");
  assert.equal(reopened.read().length, 2); assert.ok(reopened.read().some(d => d.value.rawNotes === s.rawNotes));
  a.write("session", s.id, null); assert.equal(reopened.read().length, 1); assert.equal(reopened.read()[0].value.rawNotes, "另一窗口");
  storage.setItem("rill:interviews:draft:v1:bad", "{bad json"); assert.equal(reopened.read().length, 1);
});
test("数据库关闭重开后，场次、题目及空日期可完整恢复", async () => {
  const filename = join(tmpdir(), `rill-interviews-${randomUUID()}.sqlite`);
  let db = database(filename);
  try {
    const s = await db.repo.createSession({ ...newSession("s1", fixtureJob), rawNotes: "退出重开保留" });
    const q = await db.repo.createQuestion("q1", s.id);
    await db.repo.save("question", { ...q, answer: "回答", mastery: "familiar" });
    db.close(); db = database(filename);
    assert.equal((await db.repo.read("session", s.id)).rawNotes, s.rawNotes);
    assert.equal((await db.repo.read("question", q.id)).answer, "回答");
    assert.equal((await db.repo.read("session", s.id)).interviewDate, null);
  } finally { db.close(); if (existsSync(filename)) unlinkSync(filename); }
});
test("内容比较忽略版本和保存时间，但保留原文差异", () => {
  const s = newSession("s1");
  assert.equal(sameContent("session", s, { ...s, revision: 5, updatedAt: 999 }), true);
  assert.equal(sameContent("session", s, { ...s, rawNotes: " " }), false);
});

test("首次读取晚于新建返回时，列表仍同时保留已有面经与新场次/问题", async () => {
  const db = database(), started = deferred(), gate = deferred();
  const previousWindow = globalThis.window, previousStorage = globalThis.localStorage;
  globalThis.window = { crypto: globalThis.crypto };
  globalThis.localStorage = memoryStorage();
  let pauseNextList = false;
  try {
    for (const file of ["schema-v2.sql", "schema-v3.sql", "schema-v4.sql"]) db.sqlite.exec(readFileSync(new URL(`../src/modules/jobs/${file}`, import.meta.url), "utf8"));
    const { mockIPC } = await import("@tauri-apps/api/mocks");
    mockIPC(async (command, args) => {
      if (command === "plugin:path|resolve_directory") return "test-data";
      if (command === "plugin:path|join") return args.paths.join("/");
      if (command === "plugin:sql|load") return "sqlite:test";
      const stmt = db.sqlite.prepare(args.query); stmt.setAllowUnknownNamedParameters(true);
      const params = Object.fromEntries((args.values || []).map((v, i) => [`$${i + 1}`, v]));
      if (command === "plugin:sql|execute") return [Number(stmt.run(params).changes), 0];
      const rows = stmt.all(params);
      if (pauseNextList && args.query === "SELECT * FROM interview_sessions ORDER BY updated_at DESC,id") {
        pauseNextList = false; started.resolve(); await gate.promise;
      }
      return rows;
    });
    const { initDb } = await server.ssrLoadModule("/src/kernel/db.ts");
    await initDb([]);
    const store = await load("store");
    await db.repo.createSession(newSession("existing-session"));
    pauseNextList = true;
    const initialRead = store.refreshInterviews(); await started.promise;
    const created = await store.createInterview(fixtureJob, "new-session");
    gate.resolve(); await initialRead;
    assert.deepEqual(store.useInterviewsStore.getState().sessions.map(s => s.id).sort(), ["existing-session", "new-session"]);
    const q = await store.addInterviewQuestion(created.id);
    store.patchQuestion(q.id, { answer: "通过实际 store 保存" }); await store.saveInterviewNow(created.id);
    assert.equal(store.useInterviewsStore.getState().questions.length, 1);
    assert.equal((await db.repo.read("question", q.id)).answer, "通过实际 store 保存");
    assert.equal(store.useInterviewsStore.getState().loading, false);
    assert.equal(store.useInterviewsStore.getState().error, null);
  } finally {
    gate.resolve(); db.close();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
});
