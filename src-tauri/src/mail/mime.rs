//! MIME 解析：mail-parser → MailHeader / MailBody（含附件元信息）。
//!
//! 这里只做"字节 → 结构"，不做任何 IO。

use mail_parser::{Addr, Message, MessageParser, MessagePart};

use super::encoding::{decode_part, decode_raw_header, raw_display_name};
use super::html::{html_to_text, looks_like_html};
use super::model::{AttachmentMeta, MailBody, MailHeader};

pub(crate) fn header_from_raw(uid: u32, size: u32, seen: bool, flagged: bool, raw: &[u8]) -> MailHeader {
    let parsed = MessageParser::default().parse(raw);
    let (message_id, references, in_reply_to, subject, from_name, from_address, to_address, date, preview) =
        match &parsed {
            Some(m) => {
                let fallback_subject = m.subject().unwrap_or("(无主题)").to_string();
                let fallback_from = first_name(m.from());
                (
                    m.message_id().unwrap_or("").to_string(),
                    msg_id_list(m.references().as_text()),
                    first_msg_id(m.in_reply_to().as_text()),
                    // 国内邮件常见 8-bit GBK 明文头，mail-parser 会解成乱码 → 用原始字节重解
                    decode_raw_header(raw, "Subject", &fallback_subject),
                    raw_display_name(raw, "From", &fallback_from),
                    first_address(m.from()),
                    first_address(m.to()),
                    m.date().map(|d| d.to_timestamp() * 1000).unwrap_or(0),
                    m.body_preview(160).map(|s| s.to_string()).unwrap_or_default(),
                )
            }
            None => (
                String::new(),
                Vec::new(),
                String::new(),
                "(无法解析的邮件头)".to_string(),
                String::new(),
                String::new(),
                String::new(),
                0,
                String::new(),
            ),
        };
    MailHeader {
        uid,
        message_id,
        references,
        in_reply_to,
        subject,
        from_name,
        from_address,
        to_address,
        date,
        size,
        seen,
        flagged,
        preview,
    }
}

/// References 是空格分隔的 message-id 列表（RFC 5322），这里统一拆成 `<...>` 数组
pub(crate) fn msg_id_list(value: Option<&str>) -> Vec<String> {
    let Some(text) = value else {
        return Vec::new();
    };
    text.split_whitespace()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// In-Reply-To 一般情况下只有一个 message-id
pub(crate) fn first_msg_id(value: Option<&str>) -> String {
    msg_id_list(value).into_iter().next().unwrap_or_default()
}

pub(crate) fn first_name(addr: Option<&mail_parser::Address<'_>>) -> String {
    addr.and_then(|a| a.first())
        .and_then(|a: &Addr<'_>| a.name())
        .unwrap_or("")
        .to_string()
}

pub(crate) fn first_address(addr: Option<&mail_parser::Address<'_>>) -> String {
    addr.and_then(|a| a.first())
        .and_then(|a: &Addr<'_>| a.address())
        .unwrap_or("")
        .to_string()
}

pub(crate) fn body_from_message(uid: u32, msg: &Message<'_>, raw: &[u8]) -> MailBody {
    // 全部走"原始字节 → 传输编码解码 → 字符集嗅探"，别用 text_contents / contents
    // （不声明 charset 的中文邮件会被按 UTF-8 硬解，且原始字节已被有损替换掉）
    let html = msg
        .html_bodies()
        .next()
        .map(|p| decode_part(p, raw))
        .unwrap_or_default();
    let text = match msg.text_bodies().next() {
        Some(part) => {
            let decoded = decode_part(part, raw);
            if looks_like_html(&decoded) {
                html_to_text(&decoded)
            } else {
                decoded
            }
        }
        None => html_to_text(&html),
    };
    let subject = {
        let fallback = msg.subject().unwrap_or("(无主题)").to_string();
        decode_raw_header(raw, "Subject", &fallback)
    };

    let attachments = msg
        .attachments()
        .enumerate()
        .map(|(i, p)| AttachmentMeta {
            index: i as u32,
            name: attachment_name(p).unwrap_or_else(|| format!("附件{}", i + 1)),
            mime: attachment_mime(p),
            size: p.contents().len() as u32,
        })
        .collect();

    MailBody {
        uid,
        message_id: msg.message_id().unwrap_or("").to_string(),
        subject,
        from_name: {
            let fallback = first_name(msg.from());
            raw_display_name(raw, "From", &fallback)
        },
        from_address: first_address(msg.from()),
        to_address: first_address(msg.to()),
        date: msg.date().map(|d| d.to_timestamp() * 1000).unwrap_or(0),
        text,
        html,
        attachments,
    }
}

/// 附件名：Content-Disposition 的 filename / Content-Type 的 name（mail-parser 已解码 RFC2047）
pub(crate) fn attachment_name(part: &MessagePart<'_>) -> Option<String> {
    for h in part.headers() {
        let n = h.name().to_ascii_lowercase();
        if n == "content-disposition" || n == "content-type" {
            if let Some(ct) = h.value().as_content_type() {
                if let Some(v) = ct.attribute("filename").or_else(|| ct.attribute("name")) {
                    let s = v.trim().to_string();
                    if !s.is_empty() {
                        return Some(s);
                    }
                }
            }
        }
    }
    None
}

pub(crate) fn attachment_mime(part: &MessagePart<'_>) -> String {
    for h in part.headers() {
        if h.name().eq_ignore_ascii_case("content-type") {
            if let Some(ct) = h.value().as_content_type() {
                return match ct.subtype() {
                    Some(sub) => format!("{}/{}", ct.ctype(), sub),
                    None => ct.ctype().to_string(),
                };
            }
        }
    }
    "application/octet-stream".to_string()
}
