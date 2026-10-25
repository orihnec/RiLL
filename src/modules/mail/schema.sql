-- ===== mail 模块：邮箱（IMAP 读信 + 邮件本地化） =====
-- M1「能连能看」：账号 / 文件夹 / 邮件头与正文缓存。密码不进库，走 Windows 凭据管理器
-- （keyring: service=com.riliagent.app, user=mail:{accountId}）。

CREATE TABLE IF NOT EXISTS mail_accounts (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL,                -- 邮箱地址（展示用）
  display_name       TEXT,                         -- 自定义显示名
  host               TEXT NOT NULL,                -- IMAP 主机
  port               INTEGER NOT NULL DEFAULT 993,
  security           TEXT NOT NULL DEFAULT 'ssl',  -- ssl(993) | starttls(143)
  username           TEXT NOT NULL,                -- 登录名（通常=邮箱地址）
  sync_days          INTEGER NOT NULL DEFAULT 30,  -- 首次同步回溯天数
  sync_limit         INTEGER NOT NULL DEFAULT 200, -- 每个文件夹单次最多拉多少封
  confirm_before_sync INTEGER NOT NULL DEFAULT 1,  -- 同步前是否先确认（含发往模型的内容预估）
  enabled            INTEGER NOT NULL DEFAULT 1,
  last_sync_at       INTEGER,
  last_error         TEXT,
  created_at         INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_accounts_email ON mail_accounts(email);

CREATE TABLE IF NOT EXISTS mail_folders (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  raw          TEXT NOT NULL,                      -- IMAP 线上原名（modified UTF-7，SELECT 用）
  name         TEXT NOT NULL,                      -- 解码后的显示名
  delimiter    TEXT NOT NULL DEFAULT '/',
  special      TEXT NOT NULL DEFAULT '',           -- inbox/sent/drafts/trash/junk
  selectable   INTEGER NOT NULL DEFAULT 1,
  uid_validity INTEGER NOT NULL DEFAULT 0,         -- 服务器重置 UID 时用于判断是否要全量重来
  last_uid     INTEGER NOT NULL DEFAULT 0,         -- 增量同步游标
  total        INTEGER NOT NULL DEFAULT 0,
  unread       INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_folders_raw ON mail_folders(account_id, raw);

CREATE TABLE IF NOT EXISTS mail_messages (
  id                TEXT PRIMARY KEY,
  account_id        TEXT NOT NULL,
  folder_id         TEXT NOT NULL,
  uid               INTEGER NOT NULL,              -- 文件夹内 UID（增量同步基石）
  message_id        TEXT,                          -- RFC822 Message-ID（跨文件夹去重参考）
  subject           TEXT,
  from_name         TEXT,
  from_address      TEXT,
  to_address        TEXT,
  date              INTEGER NOT NULL DEFAULT 0,    -- unix 毫秒
  size              INTEGER NOT NULL DEFAULT 0,
  seen              INTEGER NOT NULL DEFAULT 0,
  flagged           INTEGER NOT NULL DEFAULT 0,
  preview           TEXT,                          -- 列表预览
  body_text         TEXT,                          -- 打开邮件时才拉（M1 懒加载）
  body_html         TEXT,
  body_fetched_at   INTEGER,
  attachments_json  TEXT,                          -- [{index,name,mime,size}]
  created_at        INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_messages_uid ON mail_messages(account_id, folder_id, uid);
CREATE INDEX IF NOT EXISTS idx_mail_messages_date ON mail_messages(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_mail_messages_folder ON mail_messages(folder_id, date DESC);
