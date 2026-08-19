-- ===== kernel:3 —— 多会话管理（当前对话与历史记录分离） =====

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at);

-- 存量 default 会话收编为一条历史记录（标题取第一条用户消息）
INSERT OR IGNORE INTO chat_sessions (id, title, created_at, updated_at)
SELECT 'default',
       COALESCE((SELECT substr(content, 1, 24) FROM chat_messages
                 WHERE session_id = 'default' AND role = 'user'
                 ORDER BY created_at ASC, rowid ASC LIMIT 1), '新对话'),
       COALESCE((SELECT MIN(created_at) FROM chat_messages WHERE session_id = 'default'), 0),
       COALESCE((SELECT MAX(created_at) FROM chat_messages WHERE session_id = 'default'), 0)
WHERE EXISTS (SELECT 1 FROM chat_messages WHERE session_id = 'default');
