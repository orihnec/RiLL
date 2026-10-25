-- ===== kernel:4 —— 多 LLM 供应商（可同时配置多个 OpenAI 兼容端点） =====
-- API key 不落库，走系统钥匙串（user = llm-api-key:{provider_id}）。

CREATE TABLE IF NOT EXISTS llm_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  chat_model TEXT NOT NULL DEFAULT '',
  embedding_model TEXT NOT NULL DEFAULT '',
  models_json TEXT,            -- 模型列表缓存（JSON 数组；NULL = 未拉取）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_llm_providers_updated ON llm_providers(updated_at);
