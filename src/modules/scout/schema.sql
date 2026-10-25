-- ===== scout 模块：招聘雷达（招聘信息搜集与汇总） =====
-- ⚠️ 历史迁移（scout:0），内容不可再改：旧采集链路的表已在 scout:1 中 DROP，
-- 新表见 schema-v2.sql（campus_recruits）。本文件仅为迁移 id 的稳定性保留。

CREATE TABLE IF NOT EXISTS job_listings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,              -- 整理后的标题（如"XX大学2026届校招公告"）
  company TEXT,                     -- 公司名（LLM 提取）
  source TEXT NOT NULL DEFAULT 'other',  -- wechat(公众号)/campus(校招官网)/platform(招聘平台)/other
  source_name TEXT,                 -- 来源名（公众号名/学校名/平台名）
  url TEXT NOT NULL UNIQUE,         -- 原文链接（去重键）
  summary TEXT,                     -- LLM 提取的要点（岗位/地点/截止时间等）
  published_at INTEGER,             -- 发布时间（unix 毫秒，可空）
  collected_at INTEGER NOT NULL     -- 收录时间
);
CREATE INDEX IF NOT EXISTS idx_listings_source ON job_listings(source);
CREATE INDEX IF NOT EXISTS idx_listings_collected ON job_listings(collected_at);
