-- ===== mail 模块 v2：新邮件提醒 =====
-- 每个账号可单独开关提醒与检查间隔；到点后由前端定时服务增量同步收件箱，
-- 有新邮件就发 Windows 通知（复用 tauri-plugin-notification，与日程提醒同一通道）。
--
-- 注意：SQLite 无 ADD COLUMN IF NOT EXISTS，本迁移在 module 里带 skipIf（列已存在则跳过）。

ALTER TABLE mail_accounts ADD COLUMN notify INTEGER NOT NULL DEFAULT 1;
ALTER TABLE mail_accounts ADD COLUMN notify_interval INTEGER NOT NULL DEFAULT 15;
