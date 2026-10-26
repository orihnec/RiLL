import { fingerprint } from "../fingerprint";
import { apiId } from "../link";
import { allPages } from "../pagination";
import type { FeishuRequest, ImportField, SourceDescriptor, SourceRow, SourceSnapshot } from "../types";

interface BaseField { field_id: string; field_name: string; type: number; is_hidden?: boolean; }
interface View { view_id: string; property?: { hidden_fields?: string[]; filter_info?: { condition_omitted?: boolean } }; }

async function schema(request: FeishuRequest, root: string, viewId: string | null): Promise<{ fields: ImportField[]; view: View | null }> {
  const query: Record<string, string> = viewId ? { view_id: viewId } : {};
  const fields = await allPages<BaseField>(request, `${root}/fields`, query);
  let hidden: string[] = [];
  let scope: View | null = null;
  if (viewId) {
    const { view } = await request<{ view?: View }>(`${root}/views/${apiId(viewId)}`);
    if (!view || view.view_id !== viewId || !view.property || view.property.filter_info?.condition_omitted) {
      throw new Error("API 无法完整确认该视图的过滤和隐藏范围；请选择整张数据表或调整视图");
    }
    hidden = view.property.hidden_fields || [];
    scope = view;
  }
  const keys = new Set<string>();
  const visible = fields.filter((f) => !viewId || (!f.is_hidden && !hidden.includes(f.field_id))).map((f) => {
    if (!f.field_id || !f.field_name || keys.has(f.field_id)) throw new Error("字段标识缺失或重复，请重新读取表结构");
    keys.add(f.field_id);
    return { key: f.field_id, name: f.field_name, type: String(f.type), raw: f };
  });
  return { fields: visible, view: scope };
}

function recordRows(records: { record_id: string; fields: Record<string, unknown> }[], fields: ImportField[], seen: Set<string>): SourceRow[] {
  const names = new Map(fields.map((f) => [f.name, f.key]));
  return records.map((record) => {
    if (!record.record_id || seen.has(record.record_id)) throw new Error("飞书返回了重复或缺失的记录 ID，已停止读取");
    seen.add(record.record_id);
    if (!record.fields || typeof record.fields !== "object" || Array.isArray(record.fields)) throw new Error("飞书记录缺少字段数据");
    const cells: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(record.fields)) {
      const key = names.get(name);
      if (!key) throw new Error("读取期间字段发生变化或返回了范围外字段，请重新读取");
      cells[key] = value;
    }
    return { key: record.record_id, externalId: record.record_id, cells };
  });
}

export async function readBase(request: FeishuRequest, source: SourceDescriptor, onRows: (count: number) => void): Promise<SourceSnapshot> {
  const startedAt = Date.now();
  const root = `/open-apis/bitable/v1/apps/${apiId(source.resolvedResourceToken)}/tables/${apiId(source.containerId)}`;
  const initialSchema = await schema(request, root, source.viewId);
  const fields = initialSchema.fields;
  if (!fields.length) throw new Error("读取范围中没有可见字段，请核对视图和访问权限");
  const schemaHash = (value: Awaited<ReturnType<typeof schema>>) => fingerprint({ ...value, fields: [...value.fields].sort((a, b) => a.key.localeCompare(b.key)) });
  const schemaFingerprint = await schemaHash(initialSchema);
  const rows: SourceRow[] = [];
  const seen = new Set<string>();
  await allPages<{ record_id: string; fields: Record<string, unknown> }>(request, `${root}/records`, {
    ...(source.viewId ? { view_id: source.viewId } : {}),
    field_names: JSON.stringify(fields.map((f) => f.name)), text_field_as_array: "true",
  }, (records) => { rows.push(...recordRows(records, fields, seen)); onRows(rows.length); });
  if (await schemaHash(await schema(request, root, source.viewId)) !== schemaFingerprint) {
    throw new Error("读取期间表结构或可见字段发生变化，请重新读取");
  }
  const warnings = ["记录按飞书 API 返回的权限和范围读取；本次读取不保证跨分页的强一致快照。"];
  if (!rows.length) warnings.push("API 返回 0 条；若页面中有数据，请核对多维表格高级权限，不能据此认定原表为空。");
  return { source, fields, rows, schemaFingerprint, startedAt, finishedAt: Date.now(), complete: true, warnings };
}
