import { useState } from "react";
import { Button } from "../../../../components/ui/button";
import { formatAppliedAt } from "../../format";
import type { PreviewRow, RowOverride } from "../model";
import { ImportRowEditor } from "./ImportRowEditor";

type Filter = "all" | "create" | "changes" | "duplicate" | "review" | "listing" | "invalid";
const belongs = (row: PreviewRow, filter: Filter) => filter === "all" || filter === "create" && row.action === "create" ||
  filter === "changes" && Boolean(row.binding && row.reason !== "已导入，源内容未变化") || filter === "duplicate" && row.reason === "已导入，源内容未变化" ||
  filter === "review" && (row.needsReview || row.normalized.kind === "review") || row.normalized.kind === filter;
export function ImportPreviewTable({ rows, statuses, busy, editable, onSelect, onEdit, onCommit }: {
  rows: PreviewRow[]; statuses: { id: string; name: string }[]; busy: boolean; editable: boolean;
  onSelect: (keys: string[], selected: boolean) => void;
  onEdit: (patches: { key: string; patch: RowOverride }[]) => void; onCommit: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all"), [page, setPage] = useState(0), [editing, setEditing] = useState<string | null>(null);
  const visible = rows.filter((row) => belongs(row, filter)), total = Math.max(1, Math.ceil(visible.length / 20)), current = Math.min(page, total - 1);
  const selected = rows.filter((row) => row.selected && row.action !== "skip");
  const newApplications = selected.filter((row) => row.action === "create" && row.values.status !== "preparing").length;
  const newPreparing = selected.filter((row) => row.action === "create" && row.values.status === "preparing").length;
  const changed = selected.filter((row) => row.action === "update").length, linked = selected.filter((row) => row.action === "link").length;
  const row = rows.find((row) => row.normalized.key === editing);
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto text-sm font-medium">2. 预览与核对</h3>
      <select aria-label="预览筛选" className="rounded-md border bg-background p-1.5 text-xs" value={filter} onChange={(event) => { setFilter(event.target.value as Filter); setPage(0); }}>{([["all", "全部"], ["create", "可新增"], ["changes", "源变化 / 已删除"], ["duplicate", "已导入"], ["review", "待核对"], ["listing", "招聘信息"], ["invalid", "无效 / 缺字段"]] as [Filter, string][]).map(([value, label]) => <option key={value} value={value}>{label}（{rows.filter((row) => belongs(row, value)).length}）</option>)}</select>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => onSelect(visible.map((row) => row.normalized.key), true)}>选择可导入项</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSelect(rows.map((row) => row.normalized.key), false)}>取消全选</Button>
    </div>
    {editable && <div className="flex flex-wrap gap-2">
      {rows.some((row) => row.normalized.kind === "listing") && <Button size="sm" variant="outline" disabled={busy} onClick={() => onEdit(rows.filter((row) => row.normalized.kind === "listing").map((row) => ({ key: row.normalized.key, patch: { kind: "preparing", values: { status: "preparing", appliedAt: null } } })))}>将招聘信息加入准备投递</Button>}
      {rows.some((row) => !row.normalized.externalId) && <Button size="sm" variant="outline" disabled={busy} onClick={() => onEdit(rows.filter((row) => !row.normalized.externalId).map((row) => ({ key: row.normalized.key, patch: { identityConfirmed: true } })))}>确认以公司、岗位和区分字段识别本批记录</Button>}
    </div>}
    <div className="max-h-[40vh] overflow-auto rounded-lg border"><table className="w-full text-left text-xs">
      <thead className="sticky top-0 z-10 bg-background"><tr>{["选择", "公司 / 完整岗位", "源状态 → RiLL", "投递日期 / 链接", "结果与问题", "核对"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>)}</tr></thead>
      <tbody>{visible.slice(current * 20, current * 20 + 20).map((row) => <tr key={row.normalized.key} className="border-t align-top">
        <td className="px-3 py-2"><input aria-label={`选择 ${row.values.company} ${row.values.position}`} type="checkbox" checked={row.selected} disabled={busy || row.action === "skip"} onChange={(event) => onSelect([row.normalized.key], event.target.checked)} /></td>
        <td className="min-w-36 max-w-64 break-words px-3 py-2"><p className="font-medium">{row.normalized.values.company || "缺少公司"}</p><p className="mt-1 text-muted-foreground">{row.normalized.values.position || "缺少岗位"}</p></td>
        <td className="min-w-28 px-3 py-2"><p>{row.normalized.sourceStatus || "—"}</p><p className="mt-1 text-muted-foreground">→ {statuses.find((status) => status.id === row.normalized.values.status)?.name || "待核对"}</p></td>
        <td className="whitespace-nowrap px-3 py-2"><p>{formatAppliedAt(row.normalized.values.appliedAt)}</p>{row.normalized.values.url && <details className="mt-1 max-w-48 whitespace-normal break-all"><summary className="cursor-pointer text-primary">查看链接</summary>{row.normalized.values.url}</details>}</td>
        <td className="min-w-48 max-w-80 break-words px-3 py-2"><p>{row.reason}</p>{row.normalized.warnings.filter((warning) => !row.reason.includes(warning)).map((warning) => <p key={warning} className="mt-1 text-amber-500">{warning}</p>)}</td>
        <td className="px-3 py-2"><Button size="sm" variant="ghost" disabled={busy || !editable} onClick={() => setEditing(row.normalized.key)}>编辑 / 详情</Button></td>
      </tr>)}</tbody>
    </table>{visible.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">此分类没有记录</p>}</div>
    <div className="flex items-center justify-end gap-3 text-xs"><span>{visible.length} 行</span><Button size="sm" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>上一页</Button><span>{current + 1} / {total}</span><Button size="sm" variant="ghost" disabled={current + 1 >= total} onClick={() => setPage(current + 1)}>下一页</Button></div>
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3 text-xs">
      <p>选中：{newApplications} 条投递、{newPreparing} 条待投、{changed} 条更新、{linked} 条关联</p><Button disabled={busy || selected.length === 0} onClick={onCommit}>导入选中 {selected.length} 项</Button>
    </div>
    {row && <ImportRowEditor key={editing} row={row} statuses={statuses} onClose={() => setEditing(null)} onSave={(patch) => { setEditing(null); onEdit([{ key: row.normalized.key, patch }]); }} />}
  </section>;
}
