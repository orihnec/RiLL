import { useState } from "react";
import { Button } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { Textarea } from "../../../../components/ui/textarea";
import { formatAppliedAt, toDateInput } from "../../format";
import { VALUE_FIELDS, type PreviewRow, type RowOverride, type ValueField } from "../model";

const LABELS: Record<ValueField, string> = { company: "公司", position: "完整岗位", status: "状态", url: "链接", notes: "备注", appliedAt: "投递日期" };
export function ImportRowEditor({ row, statuses, onSave, onClose }: {
  row: PreviewRow; statuses: { id: string; name: string }[]; onSave: (patch: RowOverride) => void; onClose: () => void;
}) {
  const [values, setValues] = useState(row.normalized.values);
  const [kind, setKind] = useState<"application" | "preparing">(row.normalized.kind === "preparing" ? "preparing" : "application");
  const [identityConfirmed, setIdentityConfirmed] = useState(Boolean(row.normalized.externalId));
  const [independent, setIndependent] = useState(false), [targetId, setTargetId] = useState("");
  const [restore, setRestore] = useState(false), [updateFields, setUpdateFields] = useState<ValueField[]>([]);
  const [syncExtras, setSyncExtras] = useState(false);
  const change = (key: ValueField, value: unknown) => setValues((old) => ({ ...old, [key]: value }));
  const text = (value: unknown) => value === null || value === "" ? "空" : String(value);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>核对这一行</DialogTitle><DialogDescription>源行 {row.normalized.key} · 修改后重新计算预览，确认导入才写入投递。</DialogDescription></DialogHeader>
      <div className="grid gap-3 text-xs sm:grid-cols-2">
        {(["company", "position", "url"] as const).map((key) => <label key={key} className={key === "url" ? "sm:col-span-2" : ""}>{LABELS[key]}<Input aria-label={`行${LABELS[key]}`} value={values[key] ?? ""} onChange={(event) => change(key, event.target.value || (key === "url" ? null : ""))} /></label>)}
        <label>目标位置<select className="mt-1 block w-full rounded-md border bg-background p-2" value={kind} onChange={(event) => { const next = event.target.value as typeof kind; setKind(next); if (next === "preparing") setValues((v) => ({ ...v, status: "preparing", appliedAt: null })); }}><option value="application">个人已投递记录</option><option value="preparing">准备投递</option></select></label>
        <label>RiLL 状态<select aria-label="行状态" className="mt-1 block w-full rounded-md border bg-background p-2" value={values.status} disabled={kind === "preparing"} onChange={(event) => change("status", event.target.value)}><option value="">请选择</option>{statuses.filter((status) => kind === "preparing" || status.id !== "preparing").map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label>
        <label>真实投递日期（未知可留空）<Input type="date" aria-label="行投递日期" disabled={kind === "preparing"} value={toDateInput(values.appliedAt)} onChange={(event) => change("appliedAt", event.target.value ? new Date(`${event.target.value}T00:00:00`).getTime() : null)} /></label>
        <label className="sm:col-span-2">备注<Textarea aria-label="行备注" value={values.notes ?? ""} onChange={(event) => change("notes", event.target.value || null)} /></label>
      </div>
      {!row.normalized.externalId && <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={identityConfirmed} onChange={(event) => setIdentityConfirmed(event.target.checked)} />我确认以公司、完整岗位和所选区分字段识别这条记录；后续源表改变这些字段时需重新核对。</label>}
      {row.binding && !row.expected && <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={restore} onChange={(event) => setRestore(event.target.checked)} />明确恢复已在本地删除的记录（新建一条并重新关联）</label>}
      {!row.binding && row.candidates.length > 0 && <div className="space-y-2 rounded-lg border p-3 text-xs">
        <label>关联已有记录<select className="ml-2 max-w-full rounded-md border bg-background p-1" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">不关联</option>{row.candidates.map((job) => <option key={job.id} value={job.id}>{job.values.company} · {job.values.position} · {formatAppliedAt(job.values.appliedAt)} · {job.id.slice(0, 8)}</option>)}</select></label>
        <label className="flex gap-2"><input type="checkbox" checked={independent} disabled={Boolean(targetId)} onChange={(event) => setIndependent(event.target.checked)} />这是一份独立申请，新增记录</label><p className="text-muted-foreground">关联仅保存来源绑定，不覆盖现有内容。</p>
      </div>}
      {row.binding && row.expected && <div className="space-y-2 rounded-lg border p-3 text-xs"><p className="font-medium">选择允许更新的字段（默认全部保留本地）</p>
        {VALUE_FIELDS.map((field) => { const diff = row.differences.find((diff) => diff.field === field); return <label key={field} className="flex items-start gap-2"><input type="checkbox" checked={updateFields.includes(field)} onChange={(event) => setUpdateFields(event.target.checked ? [...updateFields, field] : updateFields.filter((key) => key !== field))} /><span className="min-w-0 break-all">{LABELS[field]}：本地 {text(row.expected!.values[field])} → 源表 {text(values[field])}{diff?.conflict && <strong className="ml-1 text-amber-500">本地人工修改过</strong>}{diff?.clears && <strong className="ml-1 text-red-400">将清空</strong>}</span></label>; })}
        <label className="flex gap-2"><input type="checkbox" checked={syncExtras} onChange={(event) => setSyncExtras(event.target.checked)} />同步源表的阶段和扩展字段</label>
        <p className="text-muted-foreground">更新为准备投递时会清空投递日期。关联其他来源的扩展信息继续保留。</p>
      </div>}
      {row.normalized.warnings.map((warning) => <p key={warning} className="text-xs text-amber-500">{warning}</p>)}
      <details className="rounded-lg border p-2 text-xs"><summary className="cursor-pointer">原始字段、阶段与识别依据</summary><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all font-sans">{JSON.stringify({ raw: row.normalized.raw, evidence: row.normalized.evidence, extras: row.normalized.values.extras }, null, 2)}</pre></details>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>取消</Button><Button onClick={() => onSave({ values: { company: values.company.trim(), position: values.position.trim(), status: values.status, url: values.url, notes: values.notes, appliedAt: values.appliedAt }, kind,
        identityConfirmed, independent, targetId: targetId || undefined, action: restore ? "create" : undefined, updateFields, syncExtras, selected: true })}>保存并重新预览</Button></div>
    </DialogContent>
  </Dialog>;
}
