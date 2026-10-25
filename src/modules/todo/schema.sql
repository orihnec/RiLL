-- ===== todo 模块：待办清单（可与日程绑定） =====

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  due_at INTEGER,               -- 计划/截止时间（unix 毫秒，可空）
  event_id TEXT,                -- 绑定日程（软关联，日程删除后待办保留）
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(due_at);
CREATE INDEX IF NOT EXISTS idx_todos_done ON todos(done);
