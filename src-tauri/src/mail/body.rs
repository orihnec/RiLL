//! 正文与附件：按需拉一封邮件的完整内容并落成 MailBody。

use mail_parser::MessageParser;

use crate::error::AppResult;

use super::imap::connect;
use super::mime::body_from_message;
use super::model::{MailBody, MailConfig};

pub(crate) fn fetch_body(cfg: &MailConfig, folder: &str, uid: u32) -> AppResult<MailBody> {
    let mut conn = connect(cfg)?;
    conn.select(folder)
        .map_err(|e| format!("打开文件夹失败：{e}"))?;
    let items = conn.uid_fetch(&uid.to_string(), "(UID BODY.PEEK[])")?;
    let raw = items
        .iter()
        .find_map(|i| i.literal.clone())
        .ok_or_else(|| "服务器没有返回该邮件正文".to_string())?;
    conn.logout();

    let msg = MessageParser::default()
        .parse(&raw)
        .ok_or_else(|| "邮件正文解析失败（可能是不完整的 MIME）".to_string())?;
    Ok(body_from_message(uid, &msg, &raw))
}

pub(crate) fn save_attachment(
    cfg: &MailConfig,
    folder: &str,
    uid: u32,
    index: u32,
    path: &str,
) -> AppResult<u32> {
    let mut conn = connect(cfg)?;
    conn.select(folder)
        .map_err(|e| format!("打开文件夹失败：{e}"))?;
    let items = conn.uid_fetch(&uid.to_string(), "(UID BODY.PEEK[])")?;
    let raw = items
        .iter()
        .find_map(|i| i.literal.clone())
        .ok_or_else(|| "服务器没有返回该邮件正文".to_string())?;
    conn.logout();

    let msg = MessageParser::default()
        .parse(&raw)
        .ok_or_else(|| "邮件解析失败".to_string())?;
    let part = msg
        .attachment(index)
        .ok_or_else(|| format!("找不到第 {} 个附件", index + 1))?;
    let bytes = part.contents();
    std::fs::write(path, bytes).map_err(|e| format!("写入文件失败：{e}"))?;
    Ok(bytes.len() as u32)
}
