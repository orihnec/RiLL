export interface MailPreset {
  id: string;
  name: string;
  host: string;
  port: number;
  security: "ssl" | "starttls";
  /** 授权码获取提示 */
  hint: string;
}

export function presetOf(id: string): MailPreset {
  return MAIL_PRESETS.find((p) => p.id === id) ?? MAIL_PRESETS[0];
}

export interface MailAccount {
  id: string;
  email: string;
  displayName: string | null;
  host: string;
  port: number;
  security: string;
  username: string;
  syncDays: number;
  syncLimit: number;
  confirmBeforeSync: boolean;
  /** 新邮件提醒（实时监听收件箱，有新邮件就发 Windows 通知） */
  notify: boolean;
  /** 兜底轮询间隔（分钟）：实时监听不可用时的完整同步节奏 */
  notifyInterval: number;
  /** 实时接收：服务器不支持 IDLE 时的 STATUS 查询间隔（秒） */
  watchInterval: number;
  enabled: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  createdAt: number;
}

export interface MailFolder {
  id: string;
  accountId: string;
  raw: string;
  name: string;
  delimiter: string;
  special: string;
  selectable: boolean;
  uidValidity: number;
  lastUid: number;
  total: number;
  unread: number;
  updatedAt: number;
}

export interface MailMessage {
  id: string;
  accountId: string;
  folderId: string;
  uid: number;
  messageId: string | null;
  /** 会话（线索）id，由 JWZ 算法算出（threading.ts） */
  threadId: string | null;
  references: string[];
  inReplyTo: string | null;
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  date: number;
  size: number;
  seen: boolean;
  flagged: boolean;
  preview: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  bodyFetchedAt: number | null;
  attachments: MailAttachment[];
  createdAt: number;
}

export interface MailAttachment {
  index: number;
  name: string;
  mime: string;
  size: number;
}

export interface NewAccountInput {
  presetId: string;
  email: string;
  username?: string;
  displayName?: string;
  host?: string;
  port?: number;
  security?: string;
  password: string;
  syncDays?: number;
  syncLimit?: number;
  notify?: boolean;
  notifyInterval?: number;
  watchInterval?: number;
}

export interface RustConfig {
  host: string;
  port: number;
  security: string;
  username: string;
  password: string;
}

export interface RustFolder {
  raw: string;
  name: string;
  delimiter: string;
  selectable: boolean;
  special: string;
}

export interface RustProbe {
  displayName: string;
  folders: RustFolder[];
  inboxExists: number;
  inboxUnseen: number;
  uidValidity: number;
}

export interface RustHeader {
  uid: number;
  messageId: string;
  /** 会话（线索）合并用：References / In-Reply-To */
  references: string[];
  inReplyTo: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  toAddress: string;
  date: number;
  size: number;
  seen: boolean;
  flagged: boolean;
  preview: string;
}

export interface RustHeaderBatch {
  uidValidity: number;
  exists: number;
  headers: RustHeader[];
}

export interface RustBody {
  uid: number;
  messageId: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  toAddress: string;
  date: number;
  text: string;
  html: string;
  attachments: MailAttachment[];
}

/* ---------------- 邮箱预设（少让用户查服务器地址） ---------------- */

export const MAIL_PRESETS: MailPreset[] = [
  { id: "qq", name: "QQ 邮箱", host: "imap.qq.com", port: 993, security: "ssl", hint: "设置 → 账户 → 开启 IMAP 服务；密码填「授权码」" },
  { id: "163", name: "网易 163", host: "imap.163.com", port: 993, security: "ssl", hint: "设置 → POP3/SMTP/IMAP → 开启 IMAP 并获取授权码" },
  { id: "126", name: "网易 126", host: "imap.126.com", port: 993, security: "ssl", hint: "同上，密码填授权码" },
  { id: "yeah", name: "网易 yeah", host: "imap.yeah.net", port: 993, security: "ssl", hint: "同上，密码填授权码" },
  { id: "gmail", name: "Gmail", host: "imap.gmail.com", port: 993, security: "ssl", hint: "开启两步验证后，用「应用专用密码」登录" },
  { id: "outlook", name: "Outlook", host: "outlook.office365.com", port: 993, security: "ssl", hint: "若开启两步验证，需使用应用密码" },
  { id: "icloud", name: "iCloud", host: "imap.mail.me.com", port: 993, security: "ssl", hint: "Apple ID 需生成 App 专用密码" },
  { id: "custom", name: "自定义", host: "", port: 993, security: "ssl", hint: "填服务器地址；企业邮箱常用 143 + STARTTLS" },
];

/* ---------------- 数据库行类型（SELECT 出来的原样结构） ---------------- */

export interface AccountRow {
  id: string;
  email: string;
  display_name: string | null;
  host: string;
  port: number;
  security: string;
  username: string;
  sync_days: number;
  sync_limit: number;
  confirm_before_sync: number;
  notify: number;
  notify_interval: number;
  watch_interval: number;
  enabled: number;
  last_sync_at: number | null;
  last_error: string | null;
  created_at: number;
}

export interface FolderRow {
  id: string;
  account_id: string;
  raw: string;
  name: string;
  delimiter: string;
  special: string;
  selectable: number;
  uid_validity: number;
  last_uid: number;
  total: number;
  unread: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  account_id: string;
  folder_id: string;
  uid: number;
  message_id: string | null;
  thread_id: string | null;
  references_json: string | null;
  in_reply_to: string | null;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  to_address: string | null;
  date: number;
  size: number;
  seen: number;
  flagged: number;
  preview: string | null;
  body_text: string | null;
  body_html: string | null;
  body_fetched_at: number | null;
  attachments_json: string | null;
  created_at: number;
}
