-- ===== 内核 SQL（RAG 核心 / 自迭代 / 会话） =====

-- ===== RAG 核心 =====
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT,
  embedding BLOB,
  hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);
CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(hash);
-- 内部 FTS5 表（内容冗余存储，由 RAG 核心代码同步，避免外部内容表的 rowid 对齐问题）
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  source UNINDEXED,
  tokenize = 'unicode61'
);

-- ===== 自迭代 =====
CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending 需用户确认 → active 生效
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  spec_json TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 0
);

-- ===== 会话 =====
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  tool_calls_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id);
