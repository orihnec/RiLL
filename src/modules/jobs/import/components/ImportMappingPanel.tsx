import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { cellText } from "../cells";
import { mappedFields, suggestMapping } from "../mapping";
import { MAPPING_FIELDS, type ImportMapping } from "../model";
import type { SourceSnapshot } from "../types";
import { ImportFieldPicker } from "./ImportFieldPicker";

const LABELS = { company: "公司 *", position: "岗位 *", status: "个人状态", appliedAt: "投递日期", url: "申请链接", notes: "备注", stages: "阶段记录" };
const selectClass = "rounded-md border bg-background px-2 py-1.5 text-xs";
export function ImportMappingPanel({ snapshot, mapping, statuses, busy, onChange, onPreview }: {
  snapshot: SourceSnapshot; mapping: ImportMapping; statuses: { id: string; name: string }[]; busy: boolean;
  onChange: (mapping: ImportMapping) => void; onPreview: () => void;
}) {
  const fields = mappedFields(snapshot, mapping);
  const sourceStatuses = [...new Set(snapshot.rows.map((row) => mapping.columns.status.map((key) => cellText(row.cells[key])).filter(Boolean).join(" / ")).filter(Boolean))].slice(0, 100);
  return <section className="space-y-4 rounded-xl border p-4">
    <div className="flex items-center justify-between"><h3 className="text-sm font-medium">1. 核对字段与识别规则</h3><span className="text-xs text-muted-foreground">{snapshot.rows.length} 行</span></div>
    {snapshot.source.kind === "sheets" && <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted/40 p-2 text-xs">
      {(["headerStart", "headerRows", "dataStart"] as const).map((key, i) => <label key={key} className="space-y-1">{["表头起始行", "表头行数", "数据起始行"][i]}
        <Input aria-label={key} type="number" min={1} max={10000} className="h-8 w-24" value={mapping[key]} disabled={busy} onChange={(event) => onChange({ ...mapping, [key]: Math.max(1, Number(event.target.value)) })} />
      </label>)}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => onChange({ ...suggestMapping(snapshot, mapping), defaultPosition: mapping.defaultPosition })}>按表头重新识别</Button>
    </div>}
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{MAPPING_FIELDS.map((key) => <ImportFieldPicker key={key} label={LABELS[key]} fields={fields} value={mapping.columns[key]} disabled={busy}
      onChange={(keys) => onChange({ ...mapping, columns: { ...mapping.columns, [key]: keys } })} />)}
      <label className="space-y-1 text-xs">缺少岗位时批量填写
        <Input aria-label="批量填写岗位" value={mapping.defaultPosition} disabled={busy} placeholder="填写这批记录实际申请的岗位" onChange={(event) => onChange({ ...mapping, defaultPosition: event.target.value })} />
      </label>
    </div>
    {!mapping.columns.position.length && !mapping.defaultPosition && <p className="text-xs text-amber-500">源表没有岗位映射。可批量填写岗位，或在预览中逐行补录；公司或岗位为空的行不会导入。</p>}
    {mapping.columns.status.length > 0 && <div className="space-y-2 border-t pt-3">
      <label className="flex flex-wrap items-center gap-2 text-xs">状态列表示
        <select aria-label="状态列含义" className={selectClass} disabled={busy} value={mapping.statusMeaning} onChange={(event) => onChange({ ...mapping, statusMeaning: event.target.value as ImportMapping["statusMeaning"] })}>
          <option value="unconfirmed">尚未确认（含糊项待核对）</option><option value="personal">我个人的投递进度</option><option value="recruitment">招聘开放 / 截止情况</option>
        </select>
      </label>
      <details><summary className="cursor-pointer text-xs text-muted-foreground">源状态对应关系（{sourceStatuses.length} 种）</summary>
        <div className="mt-2 grid max-h-48 gap-2 overflow-auto sm:grid-cols-2">{sourceStatuses.map((value) => <label key={value} className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 break-words">{value}</span>
          <select aria-label={`状态 ${value} 的映射`} className={selectClass} disabled={busy} value={mapping.statusMap[value] || ""} onChange={(event) => onChange({ ...mapping, statusMap: { ...mapping.statusMap, [value]: event.target.value } })}>
            <option value="">按规则 / 待核对</option>{statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
          </select></label>)}</div>
      </details>
    </div>}
    <details className="border-t pt-3 text-xs"><summary className="cursor-pointer text-muted-foreground">日期、公司继承与稳定身份设置</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2">缺年日期的年份<Input aria-label="源表年份" className="h-8 w-24" type="number" min={1900} max={2200} placeholder="不猜年份" disabled={busy} value={mapping.dateRules.year ?? ""} onChange={(event) => onChange({ ...mapping, dateRules: { ...mapping.dateRules, year: event.target.value ? Number(event.target.value) : null } })} /></label>
        <label className="flex items-center gap-2">3/4 等日期<select className={selectClass} disabled={busy} value={mapping.dateRules.order ?? ""} onChange={(event) => onChange({ ...mapping, dateRules: { ...mapping.dateRules, order: event.target.value as "mdy" | "dmy" || null } })}><option value="">保留待核对</option><option value="mdy">月 / 日</option><option value="dmy">日 / 月</option></select></label>
        <label className="flex items-center gap-2">日期格式<select className={selectClass} disabled={busy} value={mapping.dateEncoding} onChange={(event) => onChange({ ...mapping, dateEncoding: event.target.value as ImportMapping["dateEncoding"] })}><option value="auto">自动（Base 时间戳 / 文本）</option><option value="text">文本日期</option><option value="sheets-serial">Sheets 数字日期序列</option></select></label>
        <label className="flex items-center gap-2">空白公司<select className={selectClass} disabled={busy} value={mapping.inheritCompany} onChange={(event) => onChange({ ...mapping, inheritCompany: event.target.value as ImportMapping["inheritCompany"] })}><option value="none">不继承</option><option value="merged">仅真实合并单元格</option><option value="confirmed">我确认按上一行公司分组</option></select></label>
        {snapshot.source.kind === "sheets" ? <label className="flex items-center gap-2">稳定 ID 列<select className={selectClass} disabled={busy} value={mapping.externalId ?? ""} onChange={(event) => onChange({ ...mapping, externalId: event.target.value || null })}><option value="">无（逐批确认业务身份）</option>{fields.map((field) => <option key={field.key} value={field.key}>{field.name}</option>)}</select></label> : <p>稳定身份：飞书 record_id；切换视图沿用同一来源绑定。</p>}
      </div>
      {snapshot.source.kind === "sheets" && <div className="mt-3"><ImportFieldPicker label="身份区分字段" fields={fields} value={mapping.identityFields} disabled={busy} onChange={(identityFields) => onChange({ ...mapping, identityFields })} /><p className="mt-1 text-muted-foreground">没有稳定 ID 时，以公司、完整岗位和选中的批次 / 城市等字段区分；行号不参与去重。</p></div>}
    </details>
    <div className="flex items-center justify-end gap-3"><span className="text-xs text-muted-foreground">映射随来源、表结构和状态配置保存</span><Button size="sm" disabled={busy} onClick={onPreview}>生成导入预览</Button></div>
  </section>;
}
