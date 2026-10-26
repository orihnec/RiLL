import { cellText, cellUrls, sourceRowNumber } from "./cells";
import { classifyProgress } from "./classify";
import { parseImportDate } from "./dates";
import { fingerprint } from "./fingerprint";
import { mappedFields, validateMapping } from "./mapping";
import type { ImportMapping, NormalizedRow, RowOverride } from "./model";
import type { ImportField, SourceRow, SourceSnapshot } from "./types";

function inheritedCompany(snapshot: SourceSnapshot, row: SourceRow, key: string, previous: string, mapping: ImportMapping): string {
  if (mapping.inheritCompany === "confirmed") return previous;
  if (mapping.inheritCompany !== "merged") return "";
  const index = snapshot.fields.findIndex((field) => field.key === key), number = sourceRowNumber(row.key) - 1;
  const merge = snapshot.merges?.find((area) => area.startColumnIndex === index && area.endColumnIndex === index + 1 &&
    number >= area.startRowIndex && number < area.endRowIndex);
  return merge ? cellText(snapshot.rows.find((item) => sourceRowNumber(item.key) === merge.startRowIndex + 1)?.cells[key]) : "";
}

function normalizeRow(snapshot: SourceSnapshot, row: SourceRow, mapping: ImportMapping, fields: ImportField[], previous: string, statuses: { id: string; name: string }[], override?: RowOverride): NormalizedRow {
  const evidence: NormalizedRow["evidence"] = [], warnings: string[] = [];
  const text = (keys: string[]) => keys.map((key) => {
    const value = cellText(row.cells[key]).trim();
    if (value) evidence.push({ fieldKey: key, sourceText: value });
    return value;
  }).filter(Boolean).join(" / ");
  let company = text(mapping.columns.company);
  if (!company && mapping.columns.company.length === 1) {
    company = inheritedCompany(snapshot, row, mapping.columns.company[0], previous, mapping);
    if (company) evidence.push({ fieldKey: mapping.columns.company[0], sourceText: `用户确认的公司继承：${company}` });
  }
  const position = text(mapping.columns.position) || mapping.defaultPosition.trim();
  if (!mapping.columns.position.length && position) evidence.push({ fieldKey: "$user", sourceText: `用户批量填写岗位：${position}` });
  const sourceStatus = text(mapping.columns.status), notes = text(mapping.columns.notes);
  const dateKey = mapping.columns.appliedAt[0], dateRaw = row.cells[dateKey];
  const encoding = mapping.dateEncoding === "auto" ? (snapshot.fields.find((field) => field.key === dateKey)?.type === "5" ? "base-timestamp" : "text") : mapping.dateEncoding;
  const date = parseImportDate(dateRaw, encoding, mapping.dateRules);
  const dateConfirmed = override?.values?.appliedAt !== undefined;
  if (date.warning && dateRaw !== undefined && cellText(dateRaw) && !dateConfirmed) warnings.push(date.warning);
  const urls = [...new Set(mapping.columns.url.flatMap((key) => cellUrls(row.cells[key])))];
  if (urls.length > 1) warnings.push("同一行有多个链接，请在编辑行中选择实际申请链接");
  if (!urls.length && text(mapping.columns.url)) warnings.push("链接字段没有真实地址，已保留原文");
  const progress = classifyProgress(sourceStatus, date.value, mapping, statuses);
  if (progress.warning && !(override?.kind && override.values?.status)) warnings.push(progress.warning);
  let kind = progress.kind;
  if (date.warning && dateRaw !== undefined && cellText(dateRaw) && !dateConfirmed) kind = "review";
  if (date.value !== null && date.value > snapshot.finishedAt && !dateConfirmed) {
    kind = "review"; warnings.push("投递日期在未来，请确认该列不是计划或截止日期");
  }
  const stages = Object.fromEntries(mapping.columns.stages.map((key) => [key, row.cells[key]]));
  if (Object.values(stages).some((value) => cellText(value)) && !sourceStatus) {
    warnings.push("分列阶段已保留，请确认当前状态；阶段日期不代表已完成");
    kind = "review";
  }
  const values = { company, position, status: progress.status, url: urls.length === 1 ? urls[0] : null,
    notes: notes || null, appliedAt: date.value, extras: { fields: row.cells, fieldNames: Object.fromEntries(snapshot.fields.map((field) => [field.key, field.name])), stages, datePrecision: date.precision,
      source: snapshot.source, sourceRowKey: row.key, evidence } };
  if (override?.values) { Object.assign(values, override.values); evidence.push({ fieldKey: "$user", sourceText: `用户修正字段：${Object.keys(override.values).join("、")}` }); }
  if (override?.kind) kind = override.kind;
  if (kind === "application" && values.status === "preparing") { kind = "review"; warnings.push("个人已投递记录不能使用准备投递状态"); }
  if (kind === "preparing") { values.status = "preparing"; values.appliedAt = null; }
  if (!values.company.trim() || !values.position.trim()) { kind = "invalid"; warnings.push("公司和岗位必须填写"); }
  if ((kind === "application" || kind === "preparing") && !statuses.some((status) => status.id === values.status)) {
    kind = "review"; warnings.push("请选择有效的 RiLL 状态");
  }
  if (mapping.columns.appliedAt.length > 1 && !dateConfirmed) { kind = "review"; warnings.push("投递日期映射了多列，请逐行确认日期"); }
  if (urls.length > 1 && override?.values?.url === undefined) kind = "review";
  if (fields.filter((field) => cellText(row.cells[field.key]).trim() === field.name).length >= 2) {
    kind = "invalid"; warnings.push("重复表头，跳过");
  }
  if (/^(合计|总计|说明|备注|汇总)$/.test(values.company.trim())) { kind = "invalid"; warnings.push("汇总或说明行，跳过"); }
  const externalId = row.externalId ?? (mapping.externalId ? cellText(row.cells[mapping.externalId]).trim() || null : null);
  return { key: row.key, externalId, sourceFingerprint: "", kind, values, sourceStatus, evidence, warnings, raw: row.cells };
}

export async function normalizeRows(snapshot: SourceSnapshot, mapping: ImportMapping, statuses: { id: string; name: string }[], overrides: Record<string, RowOverride> = {}, signal?: AbortSignal): Promise<NormalizedRow[]> {
  validateMapping(snapshot, mapping);
  const rows: NormalizedRow[] = [];
  const fields = mappedFields(snapshot, mapping);
  let previous = "";
  for (const row of snapshot.rows) {
    if (signal?.aborted) throw new Error("已取消识别");
    if (snapshot.source.kind === "sheets" && sourceRowNumber(row.key) < mapping.dataStart) continue;
    const normalized = normalizeRow(snapshot, row, mapping, fields, previous, statuses, overrides[row.key]);
    previous = normalized.values.company || previous;
    normalized.sourceFingerprint = await fingerprint(row.cells);
    rows.push(normalized);
  }
  if (mapping.externalId) {
    const ids = rows.map((row) => row.externalId);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error("稳定 ID 列存在空值或重复值，请修正或取消该列映射");
  }
  return rows;
}
