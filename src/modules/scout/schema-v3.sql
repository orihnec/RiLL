-- ===== scout 模块 v3：截止时间归一化列 =====
-- 源站 deadline 是自由文本（2026/11/9、招满为止、尽快投递、5.18…），直接做字符串
-- 排序/比较会全错（实测 9461 条里没有一条是 YYYY-MM-DD）。这里加一列存归一化后的
-- YYYY-MM-DD：排序用它、「还能投递」也用它；原文仍保留在 deadline 里用于展示。
--
-- 注意：SQLite 无 ADD COLUMN IF NOT EXISTS，本迁移在 module 里带 skipIf（列已存在则跳过），
-- 旧值由应用启动时的一次性回填补齐（见 service.ts 的 backfillDeadlineIso）。

ALTER TABLE campus_recruits ADD COLUMN deadline_iso TEXT;
CREATE INDEX IF NOT EXISTS idx_campus_deadline_iso ON campus_recruits(deadline_iso);
