-- 面经独立保存，公司与岗位是快照；投递被删除或撤销导入后仍可查看。
CREATE TABLE IF NOT EXISTS interview_sessions (
  id TEXT PRIMARY KEY, job_id TEXT, title TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '', position TEXT NOT NULL DEFAULT '',
  round TEXT NOT NULL DEFAULT '', interview_date TEXT,
  format TEXT NOT NULL DEFAULT 'unknown' CHECK(format IN ('unknown','online','onsite','phone')),
  raw_notes TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK(review_status IN ('draft','reviewing','reviewed')),
  revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_interviews_job ON interview_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_interviews_updated ON interview_sessions(deleted_at,updated_at);
CREATE TABLE IF NOT EXISTS interview_questions (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL, prompt TEXT NOT NULL DEFAULT '', follow_ups TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '', reference_answer TEXT NOT NULL DEFAULT '', reflection TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  mastery TEXT NOT NULL DEFAULT 'unrated' CHECK(mastery IN ('unrated','needs_work','familiar','mastered')),
  revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_interview_questions_session ON interview_questions(session_id,deleted_at,sort_order);
