import { create } from "zustand";
import { errMsg } from "../../../lib/error";
import { useJobStatusStore } from "../statusStore";
import { mappedFields } from "./mapping";
import { getFrozenRows, listImportBatches } from "./repository";
import { cleanupImport, commitImport, loadImportMapping, prepareImport, previewImportUndo, undoImport } from "./workflowService";
import { suggestImportWithAI } from "./aiService";
import type { AssistSuggestions } from "./aiValidation";
import type { ImportBatch, ImportMapping, ImportResult, PreviewRow, RowOverride, UndoPreview } from "./model";
import type { SourceSnapshot } from "./types";

type Phase = "idle" | "loading" | "analyzing" | "committing" | "undoing" | "ai";
interface State {
  phase: Phase; snapshot: SourceSnapshot | null; mapping: ImportMapping | null;
  rows: PreviewRow[]; overrides: Record<string, RowOverride>; batch: ImportBatch | null; result: ImportResult | null;
  history: ImportBatch[]; undo: { batchId: string; preview: UndoPreview } | null;
  suggestions: AssistSuggestions | null; aiModel: string | null; error: string | null; notice: string | null;
  initialize: (snapshot: SourceSnapshot) => Promise<void>;
  reset: () => void;
  changeMapping: (mapping: ImportMapping) => void;
  analyze: () => Promise<void>;
  editRows: (patches: { key: string; patch: RowOverride }[]) => Promise<void>;
  selectRows: (keys: string[], selected: boolean) => void;
  commit: () => Promise<void>;
  loadHistory: () => Promise<void>;
  resume: (batch: ImportBatch) => Promise<void>;
  previewUndo: (batchId: string) => Promise<void>;
  confirmUndo: () => Promise<void>;
  dismissUndo: () => void;
  cleanup: (batchId: string) => Promise<void>;
  assist: () => Promise<void>;
  acceptSuggestions: () => Promise<void>;
  dismissSuggestions: () => void;
  cancel: () => void;
}
let active: AbortController | null = null;
const clean = { snapshot: null, mapping: null, rows: [], overrides: {}, batch: null, result: null, undo: null,
  suggestions: null, aiModel: null, error: null, notice: null };

export const useImportWorkflowStore = create<State>((set, get) => {
  const run = async (phase: Phase, action: (signal: AbortSignal) => Promise<void>) => {
    if (get().phase !== "idle") return;
    const controller = new AbortController(); active = controller;
    set({ phase, error: null, notice: null });
    try { await action(controller.signal); }
    catch (error) { set({ error: controller.signal.aborted ? null : errMsg(error), notice: controller.signal.aborted ? "已取消，正式投递未写入" : null }); }
    finally { active = null; set({ phase: "idle", ...(controller.signal.aborted ? { notice: "已取消，正式投递未写入" } : {}) }); }
  };
  const analyze = async (signal: AbortSignal) => {
    const { snapshot, mapping, overrides } = get();
    if (!snapshot || !mapping) throw new Error("请重新读取来源表格后编辑映射");
    await useJobStatusStore.getState().load();
    const prepared = await prepareImport(snapshot, mapping, useJobStatusStore.getState().statuses, overrides, signal);
    if (!signal.aborted) set({ rows: prepared.rows, batch: prepared.batch, result: null, notice: "预览已保存。勾选后点击导入，正式投递才会写入。" });
  };
  return {
    ...clean, phase: "idle", history: [],
    initialize: (snapshot) => run("loading", async () => {
      set({ ...clean, snapshot });
      const loaded = await loadImportMapping(snapshot);
      set({ mapping: loaded.mapping, notice: loaded.reused ? "已复用此来源的映射，可直接预览新增记录。" : "请核对字段和状态含义；缺少的岗位可批量填写。" });
    }),
    reset: () => { if (get().phase === "idle") set(clean); },
    changeMapping: (mapping) => { if (get().phase === "idle") set({ mapping, rows: [], batch: null, result: null, suggestions: null, notice: "映射已修改，请重新生成预览；逐行补录内容继续保留" }); },
    analyze: () => run("analyzing", analyze),
    editRows: (patches) => run("analyzing", async (signal) => {
      const overrides = { ...get().overrides };
      for (const { key, patch } of patches) overrides[key] = { ...overrides[key], ...patch,
        values: { ...overrides[key]?.values, ...patch.values } };
      set({ overrides });
      await analyze(signal);
    }),
    selectRows: (keys, selected) => {
      const chosen = new Set(keys);
      const overrides = { ...get().overrides };
      for (const row of get().rows) if (chosen.has(row.normalized.key) && row.action !== "skip") overrides[row.normalized.key] = { ...overrides[row.normalized.key], selected };
      set({ overrides, rows: get().rows.map((row) => chosen.has(row.normalized.key) && row.action !== "skip" ? { ...row, selected } : row) });
    },
    commit: () => run("committing", async () => {
      const { batch, rows } = get();
      if (!batch) throw new Error("请先生成预览");
      const result = await commitImport(batch, rows.filter((row) => row.selected && row.action !== "skip").map((row) => row.normalized.key));
      set({ result, batch: { ...batch, state: "committed", result }, notice: "导入完成，投递和准备投递列表已刷新。", history: await listImportBatches() });
    }),
    loadHistory: () => run("loading", async () => { set({ history: await listImportBatches() }); }),
    resume: (batch) => run("loading", async () => {
      if (batch.state !== "ready") { set({ result: batch.result, batch, rows: [], mapping: null, notice: "正在查看历史批次的提交结果" }); return; }
      const frozen = await getFrozenRows(batch.id);
      const rows: PreviewRow[] = frozen.map((row) => ({ normalized: row.normalized, identityKey: row.identityKey, action: row.action,
        selected: row.selected, jobId: row.jobId, expected: row.expected, binding: row.binding, values: row.values,
        candidates: [], differences: [], needsReview: row.disposition === "review", reason: "已恢复保存的预览；如需修改字段，请重新读取来源" }));
      set({ ...clean, rows, batch, notice: "已恢复上次保存的预览，提交时会再次检查本地变化。" });
    }),
    previewUndo: (batchId) => run("undoing", async () => { set({ undo: { batchId, preview: await previewImportUndo(batchId) } }); }),
    confirmUndo: () => run("undoing", async () => {
      const undo = get().undo;
      if (!undo) return;
      const result = await undoImport(undo.batchId);
      set({ undo: null, notice: `已撤销 ${result.eligible} 条操作；${result.protected} 条后续有变化，已保留。`,
        history: await listImportBatches(), batch: null, result: null, rows: [] });
    }),
    dismissUndo: () => set({ undo: null }),
    cleanup: (batchId) => run("loading", async () => {
      await cleanupImport(batchId);
      set({ history: await listImportBatches(), undo: null, ...(get().batch?.id === batchId ? { batch: null, rows: [] } : {}),
        notice: "已清理此批次的预览和撤销快照；正式投递及去重绑定保留，该批次不能再恢复或撤销。" });
    }),
    assist: () => run("ai", async (signal) => {
      const { snapshot, mapping, rows } = get();
      if (!snapshot || !mapping || !rows.length) throw new Error("请先使用规则生成预览，再请求 AI 建议");
      const result = await suggestImportWithAI(mappedFields(snapshot, mapping), rows.map((row) => row.normalized), useJobStatusStore.getState().statuses, signal);
      set({ suggestions: result.suggestions, aiModel: result.model, notice: "AI 建议尚未应用，请核对原文依据后采用。" });
    }),
    acceptSuggestions: () => run("analyzing", async (signal) => {
      const { suggestions, mapping, overrides } = get();
      if (!suggestions || !mapping) return;
      const columns = { ...mapping.columns }, next = { ...overrides };
      for (const item of suggestions.columns) columns[item.target] = item.fieldKeys;
      for (const row of suggestions.rows) next[row.key] = { ...next[row.key], kind: row.kind, values: { ...next[row.key]?.values, status: row.statusId } };
      set({ mapping: { ...mapping, columns, aiAssistance: { model: get().aiModel, acceptedAt: Date.now(), evidence: suggestions } }, overrides: next, suggestions: null });
      await analyze(signal);
    }),
    dismissSuggestions: () => set({ suggestions: null }),
    cancel: () => { if (get().phase !== "committing" && get().phase !== "undoing") active?.abort(); },
  };
});
