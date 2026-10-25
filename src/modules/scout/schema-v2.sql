-- ===== scout 模块 v2：校招信息库（campus.sma-wiki.cn 校招汇总抓取入库） =====
-- 采集方式变更：旧的「联网搜索 + LLM 提取」候选列表（job_listings）整体废弃，
-- 改为直接抓取公开的校招汇总数据（页面 const META 清单 → data/*.json 分片）后去重入库。

CREATE TABLE IF NOT EXISTS campus_recruits (
  id                TEXT PRIMARY KEY,
  dedupe_key        TEXT NOT NULL UNIQUE,   -- 去重键：网申链接唯一时用链接，否则 公司+批次+岗位
  company           TEXT NOT NULL,          -- 公司名称
  batch             TEXT,                   -- 批次（如 27届）
  positions         TEXT,                   -- 招聘岗位（多值以 , 连接）
  location          TEXT,                   -- 工作地点（多值以 , 连接）
  industry          TEXT,                   -- 行业（多值以 , 连接）
  nature            TEXT,                   -- 公司性质（国企/民营/外企…）
  month             TEXT,                   -- 收录月份
  update_date       TEXT,                   -- 更新日期
  full_date         TEXT,                   -- 完整日期
  deadline          TEXT,                   -- 截止时间
  app_link          TEXT,                   -- 网申链接
  source_link       TEXT,                   -- 信息来源链接
  link_source       TEXT,                   -- 信息来源名称
  evaluation        TEXT,                   -- 进度交流/评价
  is_key            INTEGER NOT NULL DEFAULT 0,   -- 重点推荐
  is_commercial     INTEGER NOT NULL DEFAULT 0,   -- 商业推广
  commercial_expiry TEXT,
  is_featured_card  INTEGER NOT NULL DEFAULT 0,
  raw_json          TEXT NOT NULL,          -- 源记录原文（兜底，源站加字段时无需改表）
  first_seen_at     INTEGER NOT NULL,       -- 首次收录时间（本地）
  updated_at        INTEGER NOT NULL        -- 最近一次抓取刷新时间（本地）
);
CREATE INDEX IF NOT EXISTS idx_campus_company ON campus_recruits(company);
CREATE INDEX IF NOT EXISTS idx_campus_batch ON campus_recruits(batch);
CREATE INDEX IF NOT EXISTS idx_campus_industry ON campus_recruits(industry);
CREATE INDEX IF NOT EXISTS idx_campus_month ON campus_recruits(month);
CREATE INDEX IF NOT EXISTS idx_campus_update ON campus_recruits(update_date);
CREATE INDEX IF NOT EXISTS idx_campus_seen ON campus_recruits(first_seen_at);

-- 旧表一次性清理（旧采集链路已移除，历史数据不再需要）
DROP TABLE IF EXISTS job_listings;
