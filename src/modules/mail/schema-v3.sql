-- ===== mail 模块 v3：会话（线索）合并 =====
-- 邮件客户端的基本体验：同一会话的多封邮件合并成一条（像聊天记录）。
-- thread_id 由前端用 JWZ 算法算出（见 modules/mail/threading.ts）后回写；
-- references / in_reply_to 保存原始线索字段，便于新增邮件后整文件夹重算。
--
-- 注意：SQLite 无 ADD COLUMN IF NOT EXISTS，本迁移带 skipIf（列已存在则跳过）。

ALTER TABLE mail_messages ADD COLUMN references_json TEXT;
ALTER TABLE mail_messages ADD COLUMN in_reply_to TEXT;
ALTER TABLE mail_messages ADD COLUMN thread_id TEXT;
CREATE INDEX IF NOT EXISTS idx_mail_messages_thread ON mail_messages(folder_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_msgid ON mail_messages(account_id, message_id);
