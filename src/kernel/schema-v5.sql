-- ===== kernel:5 —— memories_fts 增加 doc_id（对齐 memories 行，供检索回连） =====
-- 旧表无 doc_id，FTS5 无法与 memories 关联；M3 尚未使用，直接重建。

DROP TABLE IF EXISTS memories_fts;
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  source UNINDEXED,
  doc_id UNINDEXED,
  tokenize = 'unicode61'
);
