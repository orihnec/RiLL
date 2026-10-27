CREATE TABLE IF NOT EXISTS job_import_sources (
  id TEXT PRIMARY KEY, descriptor_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS job_import_mappings (
  source_id TEXT NOT NULL, schema_fingerprint TEXT NOT NULL, parser_version TEXT NOT NULL,
  status_fingerprint TEXT NOT NULL, mapping_json TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (source_id, schema_fingerprint, parser_version, status_fingerprint)
);
CREATE TABLE IF NOT EXISTS job_import_batches (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, state TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  preview_hash TEXT NOT NULL, status_snapshot TEXT, schema_fingerprint TEXT NOT NULL,
  mapping_json TEXT NOT NULL, result_json TEXT, created_at INTEGER NOT NULL, committed_at INTEGER
);
CREATE TABLE IF NOT EXISTS job_import_rows (
  batch_id TEXT NOT NULL, row_key TEXT NOT NULL, ordinal INTEGER NOT NULL, plan_json TEXT NOT NULL,
  result_json TEXT, PRIMARY KEY (batch_id, row_key)
);
CREATE TABLE IF NOT EXISTS job_import_bindings (
  source_id TEXT NOT NULL, identity_key TEXT NOT NULL, job_id TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL, last_source_json TEXT NOT NULL, last_written_json TEXT NOT NULL,
  target_revision INTEGER NOT NULL, last_batch_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (source_id, identity_key)
);
CREATE INDEX IF NOT EXISTS idx_job_import_batches_source ON job_import_batches(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_import_bindings_job ON job_import_bindings(job_id);
