-- ===== knowledge 模块 =====

CREATE TABLE IF NOT EXISTS kb_docs (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  hash TEXT,
  mtime INTEGER,
  index_status TEXT NOT NULL DEFAULT 'pending', -- pending/indexed/error
  updated_at INTEGER NOT NULL
);
