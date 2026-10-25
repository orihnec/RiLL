-- ===== mail 模块 v4：会话自愈的支撑索引 =====
-- 打开邮箱面板时会扫描"还没线程化"的邮件（thread_id IS NULL）补算会话：
--   SELECT folder_id, COUNT(*) FROM mail_messages WHERE thread_id IS NULL GROUP BY folder_id
-- 这个**部分索引**让该扫描在邮件量大时也是常数级。
-- 另加一个按 message_id 找会话的索引（重算后重新定位会话用）。
-- CREATE INDEX IF NOT EXISTS 本身幂等，无需 skipIf。

CREATE INDEX IF NOT EXISTS idx_mail_messages_unthreaded
  ON mail_messages(folder_id) WHERE thread_id IS NULL;
