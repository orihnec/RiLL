-- ===== jobs 模块：求职监控（投递状态管理） =====

CREATE TABLE IF NOT EXISTS job_applications (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied',   -- applied/interviewing/offer/rejected/archived
  url TEXT,
  notes TEXT,
  applied_at INTEGER NOT NULL,              -- 投递时间（unix 毫秒）
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_jobs_updated ON job_applications(updated_at);
