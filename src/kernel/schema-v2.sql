-- ===== kernel:2 —— chat_messages 增加推理内容列（DeepSeek thinking 模式需回传） =====
-- 注：SQLite 不支持 ADD COLUMN IF NOT EXISTS，列存在性由迁移的 skipIf 检查（见 migrations.ts）

ALTER TABLE chat_messages ADD COLUMN reasoning TEXT;
