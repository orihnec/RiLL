-- ===== kernel:6 —— llm_providers 增加 protocol（openai-compatible / responses） =====
-- 协议并行：OpenAI 官方 Responses API 或任意 OpenAI 兼容端点（chat/completions）。

ALTER TABLE llm_providers ADD COLUMN protocol TEXT NOT NULL DEFAULT 'openai-compatible';
