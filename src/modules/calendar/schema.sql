-- ===== calendar 模块 =====

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  start_at INTEGER NOT NULL,         -- unix 毫秒
  end_at INTEGER NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'default',  -- 类别即颜色
  rrule TEXT,                        -- 重复规则（RFC 5545），NULL = 单次
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER                 -- 软删除，防 Agent 误删
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_deleted ON events(deleted_at);

CREATE TABLE IF NOT EXISTS event_edits (   -- 隐式学习信号
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  field TEXT NOT NULL,
  before_val TEXT,
  after_val TEXT,
  via_agent INTEGER NOT NULL DEFAULT 0,     -- 是否修改的是 Agent 产出
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_edits_event ON event_edits(event_id);

-- 重复事件：删除单次（EXDATE）
CREATE TABLE IF NOT EXISTS event_exdates (
  event_id TEXT NOT NULL,
  exdate_ms INTEGER NOT NULL,              -- 被删除的原发生时间
  PRIMARY KEY (event_id, exdate_ms)
);

-- 重复事件：修改单次（override，原发生时间定位）
CREATE TABLE IF NOT EXISTS event_overrides (
  id TEXT PRIMARY KEY,
  master_id TEXT NOT NULL,
  original_start_ms INTEGER NOT NULL,
  title TEXT,
  notes TEXT,
  start_ms INTEGER,
  end_ms INTEGER,
  all_day INTEGER,
  category TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_overrides_master ON event_overrides(master_id);
