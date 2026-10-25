//! mail 的入参 / 出参（DTO）。**只有数据，没有逻辑。**
//!
//! 字段名与前端一致（serde(rename_all = "camelCase")），改名等于改契约。

use serde::{Deserialize, Serialize};
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MailConfig {
    pub host: String,
    pub port: u16,
    /// "ssl"（993 隐式 TLS，默认）或 "starttls"（143 明文升级）
    #[serde(default)]
    pub security: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    /// 线上的原始名（modified UTF-7，SELECT/SEARCH 必须用它）
    pub raw: String,
    /// 解码后的显示名（中文文件夹）
    pub name: String,
    pub delimiter: String,
    pub selectable: bool,
    /// inbox / sent / drafts / trash / junk（优先用服务器给的 \Sent 等属性判定）
    pub special: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountProbe {
    pub display_name: String,
    pub folders: Vec<FolderInfo>,
    pub inbox_exists: u32,
    /// 收件箱未读**数量**（SEARCH UNSEEN 的条数；不是 SELECT 里的 `[UNSEEN n]` 序号）
    pub inbox_unseen: u32,
    pub uid_validity: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailHeader {
    pub uid: u32,
    pub message_id: String,
    /// References / In-Reply-To：会话（线索）合并的原料，见 jwz 算法
    pub references: Vec<String>,
    pub in_reply_to: String,
    pub subject: String,
    pub from_name: String,
    pub from_address: String,
    pub to_address: String,
    /// unix 毫秒
    pub date: i64,
    pub size: u32,
    pub seen: bool,
    pub flagged: bool,
    /// 纯文本摘要（列表预览）
    pub preview: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeaderBatch {
    pub uid_validity: u32,
    pub exists: u32,
    pub headers: Vec<MailHeader>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentMeta {
    pub index: u32,
    pub name: String,
    pub mime: String,
    pub size: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailBody {
    pub uid: u32,
    pub message_id: String,
    pub subject: String,
    pub from_name: String,
    pub from_address: String,
    pub to_address: String,
    pub date: i64,
    /// 纯文本正文（没有 text/plain 时由前端用 html 兜底）
    pub text: String,
    /// HTML 正文（**前端必须消毒后再渲染**）
    pub html: String,
    pub attachments: Vec<AttachmentMeta>,
}

/// 前端传过来的"要监听的账号"。
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WatchSpec {
    pub account_id: String,
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub security: String,
    pub username: String,
    pub password: String,
    /// 要监听的文件夹线上原名（一般 INBOX）
    pub folder: String,
    /// 服务器不支持 IDLE 时的轮询间隔（秒）
    pub interval_sec: u64,
}

/// 监听事件（Rust → 前端）
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WatchEvent {
    pub account_id: String,
    /// ready | changed | error | stopped
    pub kind: String,
    pub messages: u32,
    pub unseen: u32,
    pub previous: u32,
    /// idle（真推送）| poll（STATUS 轮询）
    pub mode: String,
    pub message: String,
}

impl MailConfig {
    /// 建连前的唯一一处参数校验（以前散在各处，容易漏也容易说法不一致）。
    pub(crate) fn validate(&self) -> crate::error::AppResult<()> {
        if self.host.trim().is_empty() {
            return Err(crate::error::AppError::network("服务器地址为空"));
        }
        if self.port == 0 {
            return Err(crate::error::AppError::network("端口不能为 0"));
        }
        if self.username.trim().is_empty() || self.password.is_empty() {
            return Err(crate::error::AppError::auth("账号或授权码为空"));
        }
        Ok(())
    }
}