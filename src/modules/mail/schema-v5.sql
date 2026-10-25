-- ===== mail 模块 v5：AI 识别面试/笔试/截止 → 待确认 → 写日历（M3）=====
-- 设计约定（用户拍板）：**必须人工确认才排程**，AI 只产出候选卡片；
-- 邮件正文完整发给模型（有成本闸门：单次扫描封数与单封字数上限，见 extract.ts）。

-- 记录"这封已经交给 AI 分析过"，避免每次扫描重复烧 token
ALTER TABLE mail_messages ADD COLUMN ai_analyzed_at INTEGER;

-- AI 抽取出的日程候选（pending → confirmed / ignored）
CREATE TABLE IF NOT EXISTS mail_extractions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  thread_id TEXT,
  /** interview | written_test | career_talk | deadline | offer | other */
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  role TEXT,
  /** 毫秒时间戳；只有日期没有时刻时按全天处理 */
  start_at INTEGER,
  end_at INTEGER,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  meeting_url TEXT,
  contact TEXT,
  /** 模型给的置信度 0~1 */
  confidence REAL NOT NULL DEFAULT 0,
  /** 依据原文（引用邮件里的句子，便于用户核对后再确认） */
  evidence TEXT,
  /** 建议写入的日程分类（日历的分类 id） */
  category TEXT,
  /** 模型原始输出里的这一条（排错用） */
  raw_json TEXT,
  /** 确认后写入的 events.id */
  event_id TEXT,
  /** pending | confirmed | ignored */
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 同一封邮件里同类型同一时间的候选只留一条（重复扫描/重复确认都不产生垃圾）。
-- start_at 一定有值（没有可解析时间的候选在 normalizeCandidate 就被丢掉了），所以用普通列唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_extractions_uniq
  ON mail_extractions(message_id, kind, start_at);
CREATE INDEX IF NOT EXISTS idx_mail_extractions_status
  ON mail_extractions(status, start_at);
CREATE INDEX IF NOT EXISTS idx_mail_extractions_message
  ON mail_extractions(message_id);
