import { invoke } from "@tauri-apps/api/core";
import { notifyJobsChanged } from "../changes";
import { normalizeRows } from "./normalize";
import { buildPreview, getSourceId } from "./preview";
import { getSavedMapping, getStatusFingerprint, getStatusSnapshot, listImportBindings, listJobSnapshots } from "./repository";
import { getHeaderFingerprint, suggestMapping } from "./mapping";
import { PARSER_VERSION, type FrozenRow, type ImportBatch, type ImportMapping, type ImportResult, type PreviewRow, type RowOverride, type StagePayload, type UndoPreview } from "./model";
import type { SourceSnapshot } from "./types";

export async function loadImportMapping(snapshot: SourceSnapshot): Promise<{ mapping: ImportMapping; reused: boolean }> {
  const saved = await getSavedMapping(await getSourceId(snapshot.source), snapshot.schemaFingerprint);
  const compatible = saved && (snapshot.source.kind !== "sheets" || saved.headerFingerprint === await getHeaderFingerprint(snapshot, saved));
  return { mapping: compatible ? saved : suggestMapping(snapshot), reused: Boolean(compatible) };
}

function freezeRow(row: PreviewRow): FrozenRow {
  const disposition = row.normalized.kind === "invalid" ? "invalid" : row.needsReview || row.normalized.kind === "review" ? "review"
    : row.normalized.kind === "listing" ? "listing" : row.reason === "已导入，源内容未变化" ? "duplicate" : "unselected";
  return { key: row.normalized.key, identityKey: row.identityKey, sourceFingerprint: row.normalized.sourceFingerprint,
    kind: row.normalized.kind, action: row.action, jobId: row.jobId, values: row.values, sourceValues: row.normalized.values,
    expected: row.expected, binding: row.binding, normalized: row.normalized, disposition, selected: row.selected };
}

export async function prepareImport(snapshot: SourceSnapshot, mapping: ImportMapping, statuses: { id: string; name: string }[], overrides: Record<string, RowOverride>, signal: AbortSignal): Promise<{ rows: PreviewRow[]; batch: ImportBatch }> {
  if (!snapshot.complete) throw new Error("必须完整读取来源后才能导入");
  const sourceId = await getSourceId(snapshot.source);
  const statusSnapshot = await getStatusSnapshot();
  mapping = { ...mapping, headerFingerprint: await getHeaderFingerprint(snapshot, mapping) };
  const normalized = await normalizeRows(snapshot, mapping, statuses, overrides, signal);
  const [bindings, jobs] = await Promise.all([listImportBindings(sourceId), listJobSnapshots()]);
  const rows = await buildPreview(normalized, mapping, bindings, jobs, overrides, signal);
  if (signal.aborted) throw new Error("已取消识别");
  const payload: StagePayload = { id: crypto.randomUUID(), sourceId, source: snapshot.source,
    schemaFingerprint: snapshot.schemaFingerprint, statusSnapshot, statusFingerprint: await getStatusFingerprint(),
    parserVersion: PARSER_VERSION, mapping, rows: rows.map(freezeRow) };
  const batch = await invoke<ImportBatch>("jobs_import_stage", { payload });
  return { rows, batch };
}

export async function commitImport(batch: ImportBatch, keys: string[]): Promise<ImportResult> {
  const result = await invoke<ImportResult>("jobs_import_commit", { batchId: batch.id, previewHash: batch.hash, revision: batch.revision, selectedRowKeys: keys });
  notifyJobsChanged();
  return result;
}
export async function previewImportUndo(batchId: string): Promise<UndoPreview> {
  return invoke("jobs_import_undo_preview", { batchId });
}
export async function undoImport(batchId: string): Promise<UndoPreview> {
  const result = await invoke<UndoPreview>("jobs_import_undo", { batchId });
  notifyJobsChanged();
  return result;
}
export async function cleanupImport(batchId: string): Promise<void> {
  await invoke("jobs_import_cleanup", { batchId });
}
