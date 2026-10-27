import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

// 使用项目现有 Vite 转译器加载真实 TS 模块；不复制实现，也不引入第二套测试依赖。
const server = await createServer({ configFile: false, appType: "custom", logLevel: "error",
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { middlewareMode: true, watch: { ignored: ["**/*"] } } });
after(() => server.close());
const load = (name) => server.ssrLoadModule(`/src/modules/jobs/import/${name}.ts`);
const { parseFeishuLink } = await load("link");
const { allPages } = await load("pagination");
const { resolveFeishuSource } = await load("source");
const { readBase } = await load("readers/base");
const { readSheets, columnName } = await load("readers/sheets");
const { readApi, exchangeToken, buildApiUrl, FeishuApiError } = await load("transport");
const { fingerprint } = await load("fingerprint");
const { createCredentialVault } = await load("credentialVault");
const { parseImportDate } = await load("dates");
const { compareAppliedDates, isRecentApplication } = await load("../date");
const { suggestMapping, mappedFields, getHeaderFingerprint } = await load("mapping");
const { normalizeRows } = await load("normalize");
const { classifyProgress } = await load("classify");
const { buildPreview, getSourceId, identityKey } = await load("preview");
const { validateAssistance } = await load("aiValidation");
const rootLink = "https://my.feishu.cn/sheets/parentToken?sheet=sheetA&table=tblEmbedded&view=vewOne";
const baseSource = { connectionId: "c1", kind: "base", documentToken: "actualBase",
  resolvedResourceToken: "actualBase", containerId: "tblEmbedded", viewId: null,
  canonicalUrl: "https://my.feishu.cn/base/actualBase?table=tblEmbedded", title: "投递", containerTitle: "记录" };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });

test("链接规范化保留范围，拒绝仿冒域名、重复标识及 Wiki", () => {
  assert.equal(parseFeishuLink(`${rootLink}&from=copy`).canonicalUrl, rootLink);
  assert.equal(parseFeishuLink(rootLink).documentToken, "parentToken");
  for (const url of ["http://my.feishu.cn/base/a", "https://my.feishu.cn.evil.test/base/a", "https://evil.test/base/a",
    "https://x@my.feishu.cn/base/a", "https://my.feishu.cn/wiki/a", `${rootLink}&sheet=other`, "https://my.feishu.cn/base/a?table=../b"]) {
    assert.throws(() => parseFeishuLink(url));
  }
});

test("只向固定的飞书官方表格接口发送授权", () => {
  assert.match(buildApiUrl("/open-apis/sheets/v2/spreadsheets/a/values/b", { q: "a/b" }), /^https:\/\/open.feishu.cn\//);
  for (const path of ["https://evil.test/open-apis/sheets/x", "//evil.test/open-apis/sheets/x", "/open-apis/sheets/../authen", "/open-apis/authen/token", "/open-apis/sheets/x?u=evil"]) {
    assert.throws(() => buildApiUrl(path));
  }
});

test("内嵌表通过父表返回的 blockToken 解析，不猜测父表 token", async () => {
  const calls = [];
  const request = async (path) => {
    calls.push(path);
    if (path.endsWith("/sheets/query")) return { sheets: [{ sheet_id: "sheetA", title: "暑期实习", resource_type: "bitable" }] };
    if (path.endsWith("/metainfo")) return { sheets: [{ sheetId: "sheetA", blockInfo: { blockType: "BITABLE_BLOCK", blockToken: "actualBase_tblEmbedded" } }] };
    throw new Error("unexpected request");
  };
  const { source } = await resolveFeishuSource(request, "c1", rootLink);
  assert.equal(source.kind, "embedded-base");
  assert.equal(source.documentToken, "parentToken");
  assert.equal(source.resolvedResourceToken, "actualBase");
  assert.equal(source.containerId, "tblEmbedded");
  assert.equal(source.viewId, "vewOne");
  assert.equal(calls.length, 2);
});

test("缺少内嵌关系或 table 参数不匹配时停止，不回退为普通工作表", async () => {
  for (const blockInfo of [undefined, { blockType: "BITABLE_BLOCK", blockToken: "actualBase_tblOther" }]) {
    const request = async (path) => path.endsWith("/query")
      ? { sheets: [{ sheet_id: "sheetA", title: "嵌入", resource_type: "bitable" }] }
      : { sheets: [{ sheetId: "sheetA", blockInfo }] };
    await assert.rejects(resolveFeishuSource(request, "c1", rootLink));
  }
});

test("切换工作表清除旧表的 table/view 范围", async () => {
  const request = async () => ({ sheets: [{ sheet_id: "sheetB", title: "普通表", resource_type: "sheet", grid_properties: { row_count: 3, column_count: 2 } }] });
  const result = await resolveFeishuSource(request, "c1", rootLink, "sheetB");
  assert.equal(result.source.kind, "sheets");
  assert.equal(result.selectedId, "sheetB");
  assert.equal(result.source.viewId, null);
  assert.equal(new URL(result.source.canonicalUrl).searchParams.has("table"), false);
});

test("分页超过 500 条仍读取到 has_more=false", async () => {
  let page = 0;
  const rows = await allPages(async () => {
    const start = page++ * 100;
    return { items: Array.from({ length: start === 600 ? 1 : 100 }, (_, i) => start + i), has_more: start < 600, page_token: String(page) };
  }, "/read");
  assert.equal(rows.length, 601);
  assert.equal(rows[600], 600);
  assert.equal(page, 7);
});

test("重复游标、缺失完整性标志与超过上限均报错", async () => {
  await assert.rejects(allPages(async () => ({ items: [1], has_more: true, page_token: "same" }), "/read"), /游标/);
  await assert.rejects(allPages(async () => ({ items: [1] }), "/read"), /分页响应不完整/);
  await assert.rejects(allPages(async () => ({ items: [1, 2], has_more: false }), "/read", {}, undefined, 1), /上限/);
});

const fields = [{ field_id: "fldCompany", field_name: "企业", type: 1 }, { field_id: "fldLink", field_name: "网申", type: 15 },
  { field_id: "fldDate", field_name: "投递日", type: 5 }, { field_id: "fldCheck", field_name: "已投", type: 7 }];
const rawFields = { 企业: [{ text: "示例公司", type: "text" }], 网申: { text: "岗位", link: "https://jobs.example.test/123" }, 投递日: 1766620800000, 已投: true };

test("Base 使用 field_id 和 record_id，保留超链接、日期和复选框类型", async () => {
  const request = async (path) => path.endsWith("/fields") ? { items: fields, has_more: false }
    : { items: [{ record_id: "recOne", fields: rawFields }], has_more: false };
  const snapshot = await readBase(request, baseSource, () => {});
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.rows[0].externalId, "recOne");
  assert.deepEqual(snapshot.rows[0].cells.fldLink, rawFields.网申);
  assert.equal(snapshot.rows[0].cells.fldDate, 1766620800000);
  assert.equal(snapshot.rows[0].cells.fldCheck, true);
  assert.equal(snapshot.fields[0].key, "fldCompany");
});

test("Base 指定视图时保留 view_id，显式排除隐藏字段", async () => {
  const request = async (path, query) => {
    if (path.endsWith("/fields")) { assert.equal(query.view_id, "vewOne"); return { items: fields, has_more: false }; }
    if (path.endsWith("/views/vewOne")) return { view: { view_id: "vewOne", property: { hidden_fields: ["fldLink"] } } };
    assert.equal(query.view_id, "vewOne");
    assert.equal(JSON.parse(query.field_names).includes("网申"), false);
    return { items: [{ record_id: "recOne", fields: { 企业: "公司" } }], has_more: false };
  };
  const snapshot = await readBase(request, { ...baseSource, viewId: "vewOne" }, () => {});
  assert.equal(snapshot.fields.some((field) => field.key === "fldLink"), false);
});

test("视图属性无法确认时明确拒绝扩大范围", async () => {
  let recordsRequested = false;
  const request = async (path) => {
    if (path.endsWith("/fields")) return { items: fields, has_more: false };
    if (path.includes("/views/")) return { view: { view_id: "vewOne" } };
    recordsRequested = true;
  };
  await assert.rejects(readBase(request, { ...baseSource, viewId: "vewOne" }, () => {}), /无法完整确认/);
  assert.equal(recordsRequested, false);
});

test("重复 record_id 或读取途中改列均中止整份快照", async () => {
  const repeated = async (path) => path.endsWith("/fields") ? { items: fields, has_more: false }
    : { items: [{ record_id: "recOne", fields: rawFields }, { record_id: "recOne", fields: rawFields }], has_more: false };
  await assert.rejects(readBase(repeated, baseSource, () => {}), /记录 ID/);
  let readFields = 0;
  const changed = async (path) => path.endsWith("/fields")
    ? { items: fields.map((f) => ({ ...f, field_name: ++readFields > 4 ? `${f.field_name}改名` : f.field_name })), has_more: false }
    : { items: [{ record_id: "recOne", fields: rawFields }], has_more: false };
  await assert.rejects(readBase(changed, baseSource, () => {}), /表结构/);
});

test("普通 Sheets 按 200 行分块，行号只作定位", async () => {
  const ranges = [];
  const request = async (path) => {
    if (path.endsWith("/query")) return { sheets: [{ sheet_id: "s1", title: "表", resource_type: "sheet", grid_properties: { row_count: 601, column_count: 2 } }] };
    const range = decodeURIComponent(path.split("/").pop()); ranges.push(range);
    return { valueRange: { range, values: [["公司", { text: "岗位", link: "https://jobs.example.test/123" }]] } };
  };
  const snapshot = await readSheets(request, { ...baseSource, kind: "sheets", containerId: "s1" }, () => {});
  assert.equal(ranges.length, 4);
  assert.equal(ranges[3], "s1!A601:B601");
  assert.deepEqual(snapshot.rows.map((r) => r.externalId), [null, null, null, null]);
  assert.equal(snapshot.rows[1].key, "s1:201");
  assert.equal(columnName(25), "Z"); assert.equal(columnName(26), "AA");
});

test("HTTP 429 按 Retry-After 重试，403 不重试且区分权限原因", async () => {
  let calls = 0;
  const fetcher = async (_url, init) => {
    assert.equal(init.redirect, "error");
    assert.equal(init.maxRedirections, 0);
    assert.equal(init.headers.Authorization, "Bearer token");
    return ++calls === 1 ? json({}, 429, { "retry-after": "0" }) : json({ code: 0, data: { ok: true } });
  };
  const signal = new AbortController().signal;
  assert.deepEqual(await readApi(fetcher, buildApiUrl("/open-apis/sheets/test"), "token", signal), { ok: true });
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(readApi(async () => { calls++; return json({ code: 99991672 }, 403); }, buildApiUrl("/open-apis/sheets/test"), "token", signal), (error) => error instanceof FeishuApiError && /只读权限/.test(error.message));
  assert.equal(calls, 1);
});

test("取消请求立即结束，授权码不因失败自动重放", async () => {
  const controller = new AbortController(); controller.abort();
  let called = false;
  await assert.rejects(readApi(async () => { called = true; }, buildApiUrl("/open-apis/sheets/test"), "token", controller.signal));
  assert.equal(called, false);
  let count = 0;
  await assert.rejects(exchangeToken(async (url, init) => {
    count++; assert.equal(url, "https://accounts.feishu.cn/oauth/v3/token"); assert.equal(init.redirect, "error");
    throw new Error("do not expose request payload");
  }, { code: "private" }, new AbortController().signal), /重新连接/);
  assert.equal(count, 1);
});

test("结构哈希忽略对象键顺序，但保留字段顺序和改名差异", async () => {
  assert.equal(await fingerprint({ a: 1, b: 2 }), await fingerprint({ b: 2, a: 1 }));
  assert.notEqual(await fingerprint(fields), await fingerprint([...fields].reverse()));
  assert.notEqual(await fingerprint(fields), await fingerprint(fields.map((field) => ({ ...field, field_name: `${field.field_name}改名` }))));
});

function memoryKeyring() {
  const data = new Map();
  const storage = {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      assert.ok(Buffer.byteLength(value, "utf16le") <= 2560, "每项必须满足 Windows 凭据大小限制");
      // Windows 会按 UTF-16 解码，不能存储半个代理对。
      assert.equal(value.isWellFormed(), true);
      data.set(key, value);
    },
    remove: async (key) => { data.delete(key); },
  };
  return { data, storage };
}

test("超过 Windows 限制的 OAuth 凭据安全分段，中文和 emoji 无损回读", async () => {
  const { data, storage } = memoryKeyring();
  const vault = createCredentialVault(storage, "test-account");
  const value = JSON.stringify({ access: "fake-jwt.".repeat(1600), refresh: "fake-refresh".repeat(400), name: "中文😀".repeat(700) });
  await vault.write(value);
  assert.equal(await vault.read(), value);
  assert.ok(data.size > 10);
  const index = JSON.parse(data.get("test-account"));
  assert.equal(index.version, 2);
  assert.equal(index.retired.length, 0);
});

test("凭据分段中途写失败保留旧授权，并清理未提交分段", async () => {
  const { data, storage } = memoryKeyring();
  const vault = createCredentialVault(storage, "test-account");
  await vault.write(JSON.stringify({ token: "old" }));
  const oldKeys = [...data.keys()].sort();
  const originalSet = storage.set;
  storage.set = async (key, value) => {
    if (key.endsWith(":2")) throw new Error("simulated failure");
    await originalSet(key, value);
  };
  await assert.rejects(vault.write(JSON.stringify({ token: "new".repeat(3000) })), /无法保存/);
  assert.equal(await vault.read(), JSON.stringify({ token: "old" }));
  assert.deepEqual([...data.keys()].sort(), oldKeys);
});

test("刷新轮换只保留新凭据，断开清理所有分段", async () => {
  const { data, storage } = memoryKeyring();
  const vault = createCredentialVault(storage, "test-account");
  await vault.write(JSON.stringify({ token: "old".repeat(1500) }));
  const oldKeys = [...data.keys()].filter((key) => key !== "test-account");
  const next = JSON.stringify({ token: "new".repeat(1800) });
  await vault.write(next);
  assert.equal(await vault.read(), next);
  assert.equal(oldKeys.some((key) => data.has(key)), false);
  await vault.clear();
  assert.equal(await vault.read(), null);
  assert.equal(data.size, 0);
});

test("清理失败保留待清理引用，下次断开可恢复，不重新启用令牌", async () => {
  const { data, storage } = memoryKeyring();
  const vault = createCredentialVault(storage, "test-account");
  await vault.write(JSON.stringify({ token: "fake".repeat(700) }));
  const originalRemove = storage.remove;
  storage.remove = async () => { throw new Error("temporarily locked"); };
  await assert.rejects(vault.clear(), /部分旧凭据/);
  assert.equal(await vault.read(), null);
  assert.ok(JSON.parse(data.get("test-account")).retired.length > 0);
  storage.remove = originalRemove;
  await vault.clear();
  assert.equal(data.size, 0);
});

test("分段丢失或被修改时校验失败，不返回半份凭据", async () => {
  const { data, storage } = memoryKeyring();
  const vault = createCredentialVault(storage, "test-account");
  await vault.write(JSON.stringify({ token: "fake".repeat(900) }));
  const key = [...data.keys()].find((key) => key.endsWith(":0"));
  data.set(key, "tampered");
  await assert.rejects(vault.read(), /校验失败/);
});

test("兼容旧的短凭据，并处理索引已提交但响应丢失", async () => {
  const { data, storage } = memoryKeyring();
  data.set("test-account", JSON.stringify({ token: "legacy" }));
  const vault = createCredentialVault(storage, "test-account");
  assert.equal(await vault.read(), JSON.stringify({ token: "legacy" }));
  const originalSet = storage.set;
  storage.set = async (key, value) => {
    await originalSet(key, value);
    if (key === "test-account") throw new Error("response lost after commit");
  };
  const next = JSON.stringify({ token: "fake-new".repeat(600) });
  await vault.write(next);
  assert.equal(await vault.read(), next);
});

test("缺年和歧义日期不使用当前日期猜测，确认规则后才解析", () => {
  assert.equal(parseImportDate("3/4", "text").value, null);
  assert.equal(parseImportDate("3/4", "text", { year: 2026, order: null }).value, null);
  assert.equal(parseImportDate("3/4", "text", { year: 2026, order: "mdy" }).value, new Date(2026, 2, 4).getTime());
  assert.equal(parseImportDate("3/4", "text", { year: 2026, order: "dmy" }).value, new Date(2026, 3, 3).getTime());
  assert.equal(parseImportDate("3月4日", "text", { year: 2026, order: null }).value, new Date(2026, 2, 4).getTime());
  assert.equal(parseImportDate("2026-02-30", "text").value, null);
  assert.equal(parseImportDate("待通知", "text").value, null);
});

test("Base 毫秒、Sheets 序列和文本独立解码，保留日期精度", () => {
  const timestamp = new Date(2026, 9, 26, 13, 30).getTime();
  assert.equal(parseImportDate(timestamp, "base-timestamp").value, timestamp);
  assert.equal(parseImportDate(String(timestamp), "base-timestamp").value, null);
  const serial = (Date.UTC(2026, 9, 26) - Date.UTC(1899, 11, 30)) / 86_400_000;
  assert.equal(parseImportDate(serial, "sheets-serial").value, new Date(2026, 9, 26).getTime());
  assert.equal(parseImportDate(serial, "sheets-serial").precision, "date");
  assert.equal(parseImportDate("2026-10-26T13:30:00+08:00", "text").value, Date.parse("2026-10-26T13:30:00+08:00"));
  assert.equal(parseImportDate(null, "text").value, null);
});

test("未知日期在两个排序方向都置底；待投和未知日期不计近期投递", () => {
  for (const direction of ["asc", "desc"]) {
    assert.equal([20, null, 10].sort((a, b) => compareAppliedDates(a, b, direction)).at(-1), null);
  }
  assert.equal(isRecentApplication({ status: "preparing", applied_at: 100 }, 50), false);
  assert.equal(isRecentApplication({ status: "applied", applied_at: null }, 50), false);
  assert.equal(isRecentApplication({ status: "applied", applied_at: 100 }, 50), true);
});

const statuses = ["preparing", "applied", "interviewing", "offer", "rejected", "archived"].map((id) => ({ id, name: ({ preparing: "准备投递", applied: "已投递", interviewing: "面试中", offer: "Offer", rejected: "已拒绝", archived: "已归档" })[id] }));
const fieldDefs = [["c", "公司", "1"], ["p", "岗位", "1"], ["s", "投递状态", "3"], ["d", "投递日期", "5"], ["u", "网址", "15"], ["n", "备注", "1"], ["i", "一面", "5"]];
const snapshot = (cells, kind = "base") => ({ source: { ...baseSource, kind }, fields: fieldDefs.map(([key, name, type]) => ({ key, name, type, raw: {} })),
  rows: cells.map((cells, i) => ({ key: kind === "sheets" ? `sheet:${i + 1}` : `rec${i}`, externalId: kind === "sheets" ? null : `rec${i}`, cells })),
  schemaFingerprint: "test", complete: true, startedAt: 1793000000000, finishedAt: 1793000100000, warnings: [] });
const mapFor = (s) => ({ ...suggestMapping(s), columns: { ...suggestMapping(s).columns, stages: [] } });
const jobOf = (row, id = "local") => ({ id, values: row.values, revision: 1, updatedAt: 10, createdAt: 1 });
const bindOf = (row, identityKey, jobId = "local") => ({ sourceId: "source", identityKey, jobId, sourceFingerprint: row.sourceFingerprint,
  lastSource: structuredClone(row.values), lastWritten: structuredClone(row.values), targetRevision: 1, lastBatchId: "before", revision: 1 });

test("真实报告的五列结构：缺少岗位保持无效，用户批量补录后成为投递", async () => {
  const s = snapshot([{ c: [{ text: "示例公司", type: "text" }], d: 1787500800000, u: { link: "https://example.test/campus", text: "查看投递" } }]);
  s.fields = s.fields.filter((f) => !["p", "n", "i"].includes(f.key));
  const mapping = suggestMapping(s);
  const [empty] = await normalizeRows(s, mapping, statuses);
  assert.equal(empty.kind, "invalid"); assert.equal(empty.values.position, "");
  const [row] = await normalizeRows(s, { ...mapping, defaultPosition: "用户确认的研发岗位" }, statuses);
  assert.equal(row.kind, "application"); assert.equal(row.values.company, "示例公司");
  assert.equal(row.values.url, "https://example.test/campus"); assert.equal(row.values.position, "用户确认的研发岗位");
  assert.equal(row.values.appliedAt, 1787500800000);
});

test("混合个人投递、待投与招聘说明；笔试和本人拒绝需要显式映射", () => {
  const mapping = mapFor(snapshot([]));
  for (const [value, kind, status] of [["已投递", "application", "applied"], ["准备投递", "preparing", "preparing"], ["Offer", "application", "offer"], ["被拒", "application", "rejected"], ["已截止", "listing", "preparing"], ["笔试中", "review", ""], ["本人拒绝", "review", ""], ["流程中", "review", ""]]) {
    const actual = classifyProgress(value, null, mapping, statuses); assert.equal(actual.kind, kind, value); assert.equal(actual.status, status, value);
  }
  assert.equal(classifyProgress("招聘流程：笔试→面试", null, mapping, statuses).kind, "review");
  assert.equal(classifyProgress("已截止", null, { ...mapping, statusMeaning: "recruitment" }, statuses).kind, "listing");
  assert.equal(classifyProgress("流程中", null, { ...mapping, statusMap: { "流程中": "applied" } }, statuses).status, "applied");
});

test("模糊/未来日期进入核对，明确留空后不产生今天；待投日期始终未知", async () => {
  const s = snapshot([{ c: "公司", p: "完整岗位", s: "已投递", d: "3/4" }, { c: "公司二", p: "完整岗位", s: "准备投递", d: 1787500800000 }]);
  const mapping = { ...mapFor(s), dateEncoding: "text" };
  const rows = await normalizeRows(s, mapping, statuses);
  assert.equal(rows[0].kind, "review"); assert.equal(rows[0].values.appliedAt, null);
  const fixed = await normalizeRows(s, mapping, statuses, { rec0: { kind: "application", values: { appliedAt: null } } });
  assert.equal(fixed[0].kind, "application"); assert.equal(fixed[0].values.appliedAt, null);
  const waiting = await normalizeRows(s, mapFor(s), statuses);
  assert.equal(waiting[1].values.appliedAt, null); assert.equal(waiting[1].kind, "preparing");
});

test("分列阶段与未来面试保留原值，不按最右列提升；公司不默认向下填充", async () => {
  const s = snapshot([{ c: "示例公司甲", p: "研发岗位", i: 1900000000000 }, { p: "岗位二" }]);
  const rows = await normalizeRows(s, suggestMapping(s), statuses);
  assert.equal(rows[0].kind, "review"); assert.equal(rows[0].values.extras.stages.i, 1900000000000);
  assert.equal(rows[1].values.company, ""); assert.equal(rows[1].kind, "invalid");
  const inherited = await normalizeRows(s, { ...mapFor(s), inheritCompany: "confirmed" }, statuses);
  assert.equal(inherited[1].values.company, "示例公司甲");
});

test("多行表头与真实合并公司：仅在确认的合并区域继承", async () => {
  const s = snapshot([{ A: "求职记录" }, { A: "公司", B: "岗位", C: "投递日期" }, { A: "公司甲", B: "岗位一", C: "2026-08-01" }, { B: "岗位二" }, { B: "岗位三" }], "sheets");
  s.fields = ["A", "B", "C"].map((key) => ({ key, name: key, type: "cell", raw: {} }));
  s.merges = [{ startRowIndex: 2, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 }];
  const mapping = { ...suggestMapping(s, { headerStart: 2, headerRows: 1, dataStart: 3 }), inheritCompany: "merged" };
  assert.equal(mappedFields(s, mapping)[0].name, "公司");
  const rows = await normalizeRows(s, mapping, statuses);
  assert.equal(rows.length, 3); assert.equal(rows[1].values.company, "公司甲"); assert.equal(rows[2].values.company, "");
});

test("链接保留真实 href，多个链接待核对，不编造显示标题", async () => {
  const s = snapshot([{ c: "公司", p: "岗位", s: "已投递", u: { text: "点击进入" } }, { c: "另一公司", p: "岗位", s: "已投递", u: [{ link: "https://example.test/a" }, { link: "https://example.test/b" }] }]);
  const rows = await normalizeRows(s, mapFor(s), statuses);
  assert.equal(rows[0].values.url, null); assert.equal(rows[0].values.extras.fields.u.text, "点击进入");
  assert.equal(rows[1].kind, "review"); assert.equal(rows[1].values.url, null);
});

test("来源身份排除视图，内嵌和独立 Base 共享同一实际资源", async () => {
  const a = await getSourceId(baseSource), b = await getSourceId({ ...baseSource, kind: "embedded-base", documentToken: "parent", viewId: "view2" });
  assert.equal(a, b); assert.notEqual(a, await getSourceId({ ...baseSource, connectionId: "another-user" }));
});

test("同源同内容跳过；源变化保护手工修改和空值，按字段明确选择才更新", async () => {
  const s = snapshot([{ c: "公司", p: "完整岗位", s: "已投递", n: "原始备注" }]);
  const mapping = mapFor(s), [original] = await normalizeRows(s, mapping, statuses);
  const identity = await identityKey(original, mapping), binding = bindOf(original, identity), job = jobOf(original);
  const same = await buildPreview([original], mapping, [binding], [job]); assert.equal(same[0].action, "skip");
  const changed = structuredClone(original); changed.values.notes = null; changed.sourceFingerprint = "new-source";
  job.values = { ...job.values, notes: "人工备注" };
  const [preview] = await buildPreview([changed], mapping, [binding], [job]);
  assert.equal(preview.action, "skip"); assert.equal(preview.selected, false);
  assert.equal(preview.differences[0].conflict, true); assert.equal(preview.differences[0].clears, true);
  const [allowed] = await buildPreview([changed], mapping, [binding], [job], { rec0: { updateFields: ["notes"] } });
  assert.equal(allowed.action, "update"); assert.equal(allowed.values.notes, null); assert.equal(allowed.values.status, "applied");
});

test("本地删除的绑定不自动恢复；跨来源疑似记录必须选择关联或独立新建", async () => {
  const s = snapshot([{ c: "公司", p: "完整岗位", s: "已投递" }]), mapping = mapFor(s);
  const [row] = await normalizeRows(s, mapping, statuses), identity = await identityKey(row, mapping);
  const [deleted] = await buildPreview([row], mapping, [bindOf(row, identity)], []);
  assert.equal(deleted.action, "skip"); assert.equal(deleted.needsReview, true);
  const [candidate] = await buildPreview([row], mapping, [], [jobOf(row)]);
  assert.equal(candidate.selected, false); assert.equal(candidate.needsReview, true);
  const [linked] = await buildPreview([row], mapping, [], [jobOf(row)], { rec0: { targetId: "local" } });
  assert.equal(linked.action, "link"); assert.equal(linked.jobId, "local");
});

test("同批相似申请需要核对；公司主页相同不会合并不同完整岗位", async () => {
  const s = snapshot([{ c: "公司", p: "岗位一完整后缀A", s: "已投递", u: "https://example.test" }, { c: "公司", p: "岗位一完整后缀B", s: "已投递", u: "https://example.test" }, { c: "公司", p: "岗位一完整后缀A", s: "已投递" }]);
  const mapping = mapFor(s), rows = await normalizeRows(s, mapping, statuses);
  const preview = await buildPreview(rows, mapping, [], []);
  assert.equal(preview[0].action, "create"); assert.equal(preview[1].action, "create"); assert.equal(preview[2].needsReview, true);
  const confirmed = await buildPreview(rows, mapping, [], [], { rec2: { independent: true } }); assert.equal(confirmed[2].action, "create");
});

test("Sheets 行号不作为身份；编号唯一性校验和无编号确认生效", async () => {
  const s = snapshot([{ c: "公司", p: "岗位", s: "已投递" }], "sheets"), mapping = { ...mapFor(snapshot([])), dataStart: 1, headerStart: 1, headerRows: 0 };
  const rows = await normalizeRows(s, mapping, statuses);
  const [unconfirmed] = await buildPreview(rows, mapping, [], []); assert.equal(unconfirmed.needsReview, true);
  const [confirmed] = await buildPreview(rows, mapping, [], [], { "sheet:1": { identityConfirmed: true } }); assert.equal(confirmed.action, "create");
  const moved = { ...rows[0], key: "sheet:99" }; assert.equal(await identityKey(moved, mapping), await identityKey(rows[0], mapping));
  const duplicate = snapshot([{ c: "重复", p: "岗位" }, { c: "重复", p: "岗位二" }], "sheets");
  await assert.rejects(normalizeRows(duplicate, { ...mapping, externalId: "c" }, statuses), /重复/);
});

test("AI 必须引用真实字段、行和证据；造岗位、URL 或状态的 JSON 被拒绝", async () => {
  const s = snapshot([{ c: "公司", p: "岗位", s: "笔试中" }]), mapping = mapFor(s);
  const rows = await normalizeRows(s, mapping, statuses);
  const valid = { columns: [{ target: "company", fieldKeys: ["c"], evidence: [{ fieldKey: "c", sourceText: "公司" }] }], rows: [] };
  assert.equal(validateAssistance(valid, s.fields, rows, statuses).columns.length, 1);
  for (const bad of [ { ...valid, columns: [{ target: "company", fieldKeys: ["invented"], evidence: [{ fieldKey: "c", sourceText: "公司" }] }] },
    { columns: [], rows: [{ key: "rec0", kind: "application", statusId: "fake", evidence: [{ fieldKey: "s", sourceText: "笔试中" }] }] },
    { columns: [], rows: [{ key: "rec0", kind: "application", statusId: "applied", company: "编造", evidence: [{ fieldKey: "s", sourceText: "笔试中" }] }] } ]) assert.throws(() => validateAssistance(bad, s.fields, rows, statuses));
});

test("Sheets 表头改名与重排失效，数据内容变化不会误作表头变化", async () => {
  const s = snapshot([{ A: "公司", B: "岗位" }, { A: "公司甲", B: "研发" }], "sheets");
  s.fields = ["A", "B"].map((key) => ({ key, name: key, type: "cell", raw: {} }));
  const mapping = suggestMapping(s), original = await getHeaderFingerprint(s, mapping);
  const dataChange = structuredClone(s); dataChange.rows[1].cells.A = "新公司";
  assert.equal(original, await getHeaderFingerprint(dataChange, mapping));
  const renamed = structuredClone(s); renamed.rows[0].cells.A = "新字段";
  assert.notEqual(original, await getHeaderFingerprint(renamed, mapping));
  const reordered = structuredClone(s); reordered.rows[0].cells = { A: "岗位", B: "公司" };
  assert.notEqual(original, await getHeaderFingerprint(reordered, mapping));
});

test("Base 只重排显示字段不会使 ID 映射失效", async () => {
  const make = (reverse) => {
    let fields = 0;
    return async (path) => {
      if (path.endsWith("/fields")) { fields++; const items = [{ field_id: "a", field_name: "公司", type: 1 }, { field_id: "b", field_name: "岗位", type: 1 }]; return { items: reverse && fields > 1 ? items.reverse() : items, has_more: false }; }
      return { items: [{ record_id: "record", fields: { "公司": "公司甲", "岗位": "研发" } }], has_more: false };
    };
  };
  const s = await readBase(make(true), baseSource, () => undefined);
  assert.equal(s.rows[0].cells.a, "公司甲");
});

test("明确的数字序列字符串可解码，未来日期不计近七天", () => {
  assert.equal(parseImportDate("46000", "sheets-serial").value, parseImportDate(46000, "sheets-serial").value);
  assert.equal(isRecentApplication({ status: "applied", applied_at: 300 }, 100, 200), false);
});
