-- ===== kernel:2 —— chat_messages 增加推理内容列（DeepSeek thinking 模式需回传） =====

ALTER TABLE chat_messages ADD COLUMN reasoning TEXT;
