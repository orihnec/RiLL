-- ===== kernel:1 —— 应用设置（key-value 持久化；API key 不放这里，走系统钥匙串） =====

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
