-- ===== kernel:7 —— chat_messages 增加附件（上传文件随消息落库） =====

ALTER TABLE chat_messages ADD COLUMN attachments_json TEXT;
