import { fingerprint } from "./fingerprint";
import { VALUE_FIELDS, type ImportBinding, type ImportMapping, type JobSnapshot, type JobValues, type NormalizedRow, type PreviewRow, type RowOverride } from "./model";
import type { SourceDescriptor } from "./types";

export const equalValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const businessMatch = (a: JobValues, b: JobValues) => a.company.trim().toLowerCase() === b.company.trim().toLowerCase() && a.position.trim().toLowerCase() === b.position.trim().toLowerCase();

export function getSourceId(source: SourceDescriptor): Promise<string> {
  // 同一 Base 的嵌入入口、独立入口和不同视图共享绑定；视图只决定本次读取范围。
  return fingerprint({ connection: source.connectionId, type: source.kind === "sheets" ? "sheets" : "base",
    resource: source.resolvedResourceToken, container: source.containerId });
}

export async function identityKey(row: NormalizedRow, mapping: ImportMapping): Promise<string> {
  if (row.externalId) return `id:${row.externalId}`;
  return `business:${await fingerprint({ company: row.values.company.trim().toLowerCase(), position: row.values.position.trim().toLowerCase(),
    extra: Object.fromEntries(mapping.identityFields.map((key) => [key, row.raw[key]])) })}`;
}

function bindingPlan(row: PreviewRow, override: RowOverride): PreviewRow {
  const binding = row.binding!;
  if (!row.expected) return { ...row, action: override.action === "create" ? "create" : "skip",
    jobId: row.jobId, selected: override.action === "create", needsReview: override.action !== "create",
    reason: "本地记录已删除；仅在明确选择恢复后新建" };
  row.jobId = row.expected.id;
  row.differences = VALUE_FIELDS.filter((field) => !equalValue(row.normalized.values[field], binding.lastSource[field])).map((field) => ({
    field, before: binding.lastWritten[field], local: row.expected!.values[field], incoming: row.normalized.values[field],
    conflict: !equalValue(row.expected!.values[field], binding.lastWritten[field]),
    clears: row.normalized.values[field] === null || row.normalized.values[field] === "",
  }));
  if (!row.differences.length && row.normalized.sourceFingerprint === binding.sourceFingerprint) {
    return { ...row, action: "skip", selected: false, reason: "已导入，源内容未变化", needsReview: false };
  }
  const allowed = override.updateFields ?? [];
  const values = { ...row.expected.values };
  for (const field of allowed) Object.assign(values, { [field]: row.normalized.values[field] });
  if (allowed.includes("status") && values.status === "preparing") values.appliedAt = null;
  const update = allowed.length > 0 || override.syncExtras;
  if (update) {
    const extra = row.normalized.values.extras ?? {}, source = extra.source as SourceDescriptor;
    const key = `${source.resolvedResourceToken}:${source.containerId}`;
    values.extras = { ...row.expected.values.extras, ...extra, imports: { ...row.expected.values.extras?.imports as object, [key]: extra } };
  }
  return { ...row, action: update ? "update" : "skip", values, selected: Boolean(update) && override.selected !== false,
    needsReview: false, reason: update ? `更新已勾选字段和来源扩展信息` : "源内容有变化，默认保留本地内容；选择要更新的字段" };
}

function newPlan(row: PreviewRow, override: RowOverride): PreviewRow {
  const target = row.candidates.find((job) => job.id === override.targetId);
  if (target) return { ...row, action: "link", expected: target, values: target.values, jobId: target.id,
    selected: override.selected !== false, needsReview: false, reason: "仅关联来源，保留现有记录全部内容" };
  if (row.candidates.length && !override.independent) return { ...row, action: "skip", selected: false, needsReview: true,
    reason: "存在相同公司与完整岗位的本地记录，请选择关联或独立新建" };
  return { ...row, action: "create", selected: override.selected !== false, reason: "新增记录" };
}

export async function buildPreview(rows: NormalizedRow[], mapping: ImportMapping, bindings: ImportBinding[], jobs: JobSnapshot[], overrides: Record<string, RowOverride> = {}, signal?: AbortSignal): Promise<PreviewRow[]> {
  const result: PreviewRow[] = [], seen = new Set<string>(), businesses = new Set<string>();
  const bound = new Map(bindings.map((binding) => [binding.identityKey, binding]));
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const businessKey = (values: JobValues) => JSON.stringify([values.company.trim().toLowerCase(), values.position.trim().toLowerCase()]);
  const candidates = new Map<string, JobSnapshot[]>();
  for (const job of jobs) { const key = businessKey(job.values), group = candidates.get(key); if (group) group.push(job); else candidates.set(key, [job]); }
  for (const normalized of rows) {
    if (signal?.aborted) throw new Error("已取消分析");
    const override = overrides[normalized.key] ?? {}, identity = await identityKey(normalized, mapping);
    const binding = bound.get(identity) ?? null;
    const expected = binding ? byId.get(binding.jobId) ?? null : null;
    let row: PreviewRow = { normalized, identityKey: identity, binding, expected, action: "skip", selected: false,
      jobId: crypto.randomUUID(), values: normalized.values, candidates: candidates.get(businessKey(normalized.values)) ?? [],
      differences: [], reason: "", needsReview: false };
    const duplicate = seen.has(identity);
    seen.add(identity);
    const business = await fingerprint({ company: normalized.values.company.trim().toLowerCase(), position: normalized.values.position.trim().toLowerCase(),
      extra: Object.fromEntries(mapping.identityFields.map((key) => [key, normalized.raw[key]])) });
    const similar = businesses.has(business);
    businesses.add(business);
    if (normalized.kind === "invalid" || normalized.kind === "review") row.reason = normalized.warnings.join("；") || "需要核对";
    else if (normalized.kind === "listing") row.reason = "招聘信息默认不导入，可选择加入准备投递";
    else if (duplicate) { row.reason = "本批次身份重复，请指定唯一 ID、增加区分字段或拆成不同批次"; row.needsReview = true; }
    else if (!binding && similar && !override.independent) { row.reason = "本批次公司与完整岗位重复，请核对是否为独立申请"; row.needsReview = true; }
    else if (!normalized.externalId && !override.identityConfirmed && (!binding || binding.sourceFingerprint !== normalized.sourceFingerprint)) { row.reason = "缺少稳定 ID，请确认以公司、完整岗位和区分字段作为身份"; row.needsReview = true; }
    else row = binding ? bindingPlan(row, override) : newPlan(row, override);
    if (override.selected === false) row.selected = false;
    result.push(row);
  }
  return result;
}
