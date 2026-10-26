import { useEffect, useState } from "react";
import { Button } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { FEISHU_REDIRECT_URI, FEISHU_SCOPES, useJobImportStore } from "../store";
import { FeishuConnectionForm } from "../components/FeishuConnectionForm";
import { FeishuSourcePanel } from "../components/FeishuSourcePanel";
import { FeishuReadPreview } from "../components/FeishuReadPreview";
import { ImportMappingPanel } from "../components/ImportMappingPanel";
import { ImportPreviewTable } from "../components/ImportPreviewTable";
import { ImportAiPanel, ImportHistory, ImportResultPanel, ImportUndoPanel } from "../components/ImportFeedback";
import { useImportWorkflowStore } from "../workflowStore";
import { useJobStatusStore } from "../../statusStore";
import { useUiStore } from "../../../../stores/uiStore";

export function JobImportDialog() {
  const state = useJobImportStore();
  const workflow = useImportWorkflowStore();
  const statuses = useJobStatusStore((state) => state.statuses);
  const [aiConsent, setAiConsent] = useState(false);
  const busy = state.phase !== "idle" || workflow.phase !== "idle";
  useEffect(() => { if (state.open) void useImportWorkflowStore.getState().loadHistory(); }, [state.open]);
  const viewJobs = (tab: "preparing" | "applied") => { useUiStore.getState().setJobTab(tab); state.closeDialog(); };
  return (
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) state.closeDialog(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-5xl" showCloseButton={!busy} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>从飞书导入投递</DialogTitle>
          <DialogDescription>连接并读取表格 → 核对映射 → 预览导入。首次使用自己的飞书应用；凭据保存在本机系统钥匙串。</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <FeishuConnectionForm connection={state.connection} busy={busy} redirectUri={FEISHU_REDIRECT_URI} scopes={FEISHU_SCOPES}
            onConnect={(appId, secret) => { void state.connect(appId, secret); }} onDisconnect={() => { void state.disconnect(); }} />
          <FeishuSourcePanel input={state.input} busy={busy} connected={Boolean(state.connection)} resolution={state.resolution}
            entireTable={state.entireTable} onInput={state.setInput} onInspect={(id) => { void state.inspect(id); }} onEntireTable={state.setEntireTable} onRead={() => { void state.read(); }} />
          {state.phase === "authorizing" && <p role="status" className="text-sm">请在系统浏览器中完成飞书登录和授权，完成后会自动返回连接结果。</p>}
          {state.progress && <p role="status" className="text-sm">{state.progress.stage} · {state.progress.records} 行 · {state.progress.requests} 次请求</p>}
          {state.error && <p role="alert" className="break-words rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{state.error}</p>}
          {state.notice && <p role="status" className="break-words text-sm text-muted-foreground">{state.notice}</p>}
          {workflow.phase !== "idle" && <p role="status" className="text-sm">{{ loading: "正在加载本地配置…", analyzing: "正在识别、检查重复并保存预览…", committing: "正在原子提交，请等待结果…", undoing: "正在检查或撤销批次…", ai: "当前模型正在生成建议…" }[workflow.phase]}</p>}
          {workflow.error && <p role="alert" className="break-words rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{workflow.error}</p>}
          {workflow.notice && <p role="status" className="break-words text-sm text-muted-foreground">{workflow.notice}</p>}
          {state.snapshot && <details className="rounded-xl border p-3 text-xs"><summary className="cursor-pointer">原始读取结果 · {state.snapshot.rows.length} 行 · 查看 / 保存验证报告</summary><div className="mt-3"><FeishuReadPreview snapshot={state.snapshot} busy={busy} onSave={() => { void state.saveReport(); }} /></div></details>}
          {workflow.snapshot && workflow.mapping && !workflow.result && <ImportMappingPanel snapshot={workflow.snapshot} mapping={workflow.mapping} statuses={statuses} busy={busy}
            onChange={workflow.changeMapping} onPreview={() => { void workflow.analyze(); }} />}
          {workflow.rows.length > 0 && !workflow.result && <>
            <ImportPreviewTable rows={workflow.rows} statuses={statuses} busy={busy} editable={Boolean(workflow.snapshot && workflow.mapping)}
              onSelect={workflow.selectRows} onEdit={(patches) => { void workflow.editRows(patches); }} onCommit={() => { void workflow.commit(); }} />
            {workflow.snapshot && <div className="space-y-2 rounded-xl border p-3 text-xs">
              <label className="flex items-start gap-2"><input type="checkbox" checked={aiConsent} disabled={busy} onChange={(event) => setAiConsent(event.target.checked)} />允许当前模型分析字段名称和最多 40 条待核对记录（最多 50,000 字符，按当前模型计费）；不发送连接密钥。规则和手动核对可独立完成导入。</label>
              <Button size="sm" variant="outline" disabled={busy || !aiConsent} onClick={() => { void workflow.assist(); }}>请求 AI 辅助建议</Button>
            </div>}
          </>}
          {workflow.suggestions && <ImportAiPanel suggestions={workflow.suggestions} model={workflow.aiModel} busy={busy} onAccept={() => { void workflow.acceptSuggestions(); }} onDismiss={workflow.dismissSuggestions} />}
          {workflow.result && <ImportResultPanel result={workflow.result} busy={busy} canUndo={workflow.batch?.state === "committed" || workflow.batch?.state === "partially_undone"} onView={viewJobs} onUndo={() => { if (workflow.batch) void workflow.previewUndo(workflow.batch.id); }} />}
          {workflow.undo && <ImportUndoPanel preview={workflow.undo.preview} busy={busy} onConfirm={() => { void workflow.confirmUndo(); }} onCancel={workflow.dismissUndo} />}
          <ImportHistory batches={workflow.history} busy={busy} onRefresh={() => { void workflow.loadHistory(); }} onResume={(batch) => { void workflow.resume(batch); }} onUndo={(id) => { void workflow.previewUndo(id); }} onCleanup={(id) => { void workflow.cleanup(id); }} />
        </div>
        <div className="flex shrink-0 justify-end">
          {busy ? <Button variant="outline" onClick={() => { state.cancel(); workflow.cancel(); }} disabled={state.phase === "saving" || workflow.phase === "committing" || workflow.phase === "undoing"}>取消</Button> : <Button variant="outline" onClick={state.closeDialog}>关闭</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
