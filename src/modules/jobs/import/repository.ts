import { getDb } from "../../../kernel/db";
import { fingerprint } from "./fingerprint";
import { PARSER_VERSION, type FrozenRow, type ImportBatch, type ImportBinding, type ImportMapping, type JobSnapshot } from "./model";
import { listJobs } from "../service";

export async function getStatusSnapshot(): Promise<string | null> {
  const rows = await getDb().select<{ value: string }[]>("SELECT value FROM app_settings WHERE key = 'job_statuses'");
  return rows[0]?.value ?? null;
}
export async function getStatusFingerprint(): Promise<string> { return fingerprint(await getStatusSnapshot()); }

export async function getSavedMapping(sourceId: string, schema: string): Promise<ImportMapping | null> {
  const rows = await getDb().select<{ mapping_json: string }[]>(`SELECT mapping_json FROM job_import_mappings
    WHERE source_id=$1 AND schema_fingerprint=$2 AND parser_version=$3 AND status_fingerprint=$4`,
    [sourceId, schema, PARSER_VERSION, await getStatusFingerprint()]);
  return rows[0] ? JSON.parse(rows[0].mapping_json) as ImportMapping : null;
}

export async function listImportBindings(sourceId: string): Promise<ImportBinding[]> {
  const rows = await getDb().select<Record<string, unknown>[]>("SELECT * FROM job_import_bindings WHERE source_id=$1", [sourceId]);
  return rows.map((row) => ({ sourceId: String(row.source_id), identityKey: String(row.identity_key), jobId: String(row.job_id),
    sourceFingerprint: String(row.source_fingerprint), lastSource: JSON.parse(String(row.last_source_json)),
    lastWritten: JSON.parse(String(row.last_written_json)), targetRevision: Number(row.target_revision), lastBatchId: String(row.last_batch_id), revision: Number(row.revision) }));
}

export async function listJobSnapshots(): Promise<JobSnapshot[]> {
  return (await listJobs()).map((job) => ({ id: job.id, revision: job.revision, updatedAt: job.updated_at, createdAt: job.created_at,
    values: { company: job.company, position: job.position, status: job.status, url: job.url, notes: job.notes, appliedAt: job.applied_at, extras: job.extras } }));
}

export async function listImportBatches(): Promise<ImportBatch[]> {
  const rows = await getDb().select<Record<string, unknown>[]>("SELECT id, source_id, state, preview_hash, revision, created_at, result_json FROM job_import_batches ORDER BY created_at DESC LIMIT 30");
  return rows.map((row) => ({ id: String(row.id), sourceId: String(row.source_id), state: String(row.state), hash: String(row.preview_hash),
    revision: Number(row.revision), createdAt: Number(row.created_at), result: row.result_json ? JSON.parse(String(row.result_json)) : null }));
}

export async function getFrozenRows(batchId: string): Promise<FrozenRow[]> {
  const rows = await getDb().select<{ plan_json: string }[]>("SELECT plan_json FROM job_import_rows WHERE batch_id=$1 ORDER BY ordinal", [batchId]);
  return rows.map((row) => JSON.parse(row.plan_json) as FrozenRow);
}
