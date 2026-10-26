import { Button } from "../../../../components/ui/button";
import { useState } from "react";
import type { AssistSuggestions } from "../aiValidation";
import type { ImportBatch, ImportResult, UndoPreview } from "../model";

const STATES: Record<string, string> = { ready: "预览待确认", committed: "已导入", undone: "已撤销", partially_undone: "部分撤销", canceled: "已取消", purged: "快照已清理" };
export function ImportResultPanel({ result, onView, onUndo, busy, canUndo }: {
  result: ImportResult; onView: (tab: "applied" | "preparing") => void; onUndo: () => void; busy: boolean; canUndo: boolean;
}) {
  return <section className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
    <p className="font-medium">本批次：新增投递 {result.createdApplications} · 新增待投 {result.createdPreparing} · 更新 {result.updated} · 关联 {result.linked}</p>
    <p className="text-xs text-muted-foreground">已存在 {result.duplicates} · 招聘信息未选 {result.unselectedListings} · 待核对 {result.needsReview} · 无效 {result.invalid} · 未选择 {result.unselected} · 失败 {result.failed}</p>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => onView("applied")}>查看已投递</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => onView("preparing")}>查看准备投递</Button>{canUndo && <Button size="sm" variant="ghost" disabled={busy} onClick={onUndo}>预览撤销本批次</Button>}</div>
  </section>;
}
export function ImportHistory({ batches, busy, onRefresh, onResume, onUndo, onCleanup }: {
  batches: ImportBatch[]; busy: boolean; onRefresh: () => void; onResume: (batch: ImportBatch) => void; onUndo: (batchId: string) => void; onCleanup: (batchId: string) => void;
}) {
  const [armed, setArmed] = useState<string | null>(null);
  return <details className="rounded-xl border p-3 text-xs"><summary className="cursor-pointer">本地导入历史与恢复（最近 30 批）</summary>
    <Button className="my-2" size="sm" variant="ghost" disabled={busy} onClick={onRefresh}>刷新历史</Button>
    <div className="max-h-56 space-y-2 overflow-auto">{batches.map((batch) => <div key={batch.id} className="flex flex-wrap items-center gap-2 border-t pt-2"><span className="mr-auto">{new Date(batch.createdAt).toLocaleString("zh-CN")} · {STATES[batch.state] || batch.state} · {batch.id.slice(0, 8)}</span>
      {batch.state === "ready" && <Button size="sm" variant="outline" disabled={busy} onClick={() => onResume(batch)}>恢复预览</Button>}
      {batch.result && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onResume(batch)}>查看结果</Button>}
      {["committed", "partially_undone"].includes(batch.state) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUndo(batch.id)}>撤销预览</Button>}
      {!["canceled", "purged"].includes(batch.state) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (armed === batch.id) { onCleanup(batch.id); setArmed(null); } else setArmed(batch.id); }}>{armed === batch.id ? "确认清理（失去恢复/撤销能力）" : "清理批次快照"}</Button>}
    </div>)}{batches.length === 0 && <p className="text-muted-foreground">尚无保存的导入批次</p>}</div>
  </details>;
}
export function ImportUndoPanel({ preview, busy, onConfirm, onCancel }: { preview: UndoPreview; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return <section className="space-y-3 rounded-xl border border-amber-500/40 p-4 text-xs">
    <p className="font-medium">撤销预览：{preview.eligible} 条可撤销，{preview.protected} 条因后续变化而保留。</p>
    <p>撤销新建会移除未变的记录；撤销更新会恢复修改前内容；仅关联的操作会解除来源绑定。提交时会再次核对变化。</p>
    <div className="max-h-32 overflow-auto">{preview.rows.map((row) => <p key={row.key}>{row.key} · {row.action} · {row.reason}</p>)}</div>
    <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>取消</Button><Button size="sm" variant="outline" disabled={busy || !preview.eligible} onClick={onConfirm}>确认撤销可撤销项</Button></div>
  </section>;
}
export function ImportAiPanel({ suggestions, model, busy, onAccept, onDismiss }: { suggestions: AssistSuggestions; model: string | null; busy: boolean; onAccept: () => void; onDismiss: () => void }) {
  return <section className="space-y-2 rounded-xl border p-4 text-xs"><p className="font-medium">AI 建议 · {model} · 尚未应用</p>
    <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all font-sans">{JSON.stringify(suggestions, null, 2)}</pre>
    <p className="text-muted-foreground">采用后仍需在预览中核对并选择，不会自动写入正式投递。</p>
    <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>放弃建议</Button><Button size="sm" variant="outline" disabled={busy} onClick={onAccept}>采用建议并重新预览</Button></div>
  </section>;
}
