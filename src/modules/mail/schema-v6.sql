-- ===== mail 模块 v6：实时接收（IMAP IDLE / 快速 STATUS 轮询）=====
-- 听邮件的活干在 Rust 侧（常驻线程 + 长连接），因为 WebView2 会把后台的 JS 定时器
-- 节流到 1 分钟粒度 —— 靠 JS 定时器永远做不到"准实时"。
--
-- watch_interval：服务器不支持 IDLE 时的轮询间隔（秒）。163/Coremail 实测**不支持 IDLE**，
-- 但 STATUS INBOX (MESSAGES UNSEEN) 只要 ~21ms，所以 20 秒一次就很接近实时；
-- QQ / Gmail 支持 IDLE，会走真正的服务器推送，这个间隔就不用了。
ALTER TABLE mail_accounts ADD COLUMN watch_interval INTEGER NOT NULL DEFAULT 20;
