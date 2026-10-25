//! LIST / SELECT / STATUS：文件夹列表、特殊文件夹判定、会话计数。

use super::super::encoding::decode_mutf7;
use super::super::model::FolderInfo;
use super::{bracket_number, number_after, quote, Conn};

#[derive(Default)]
pub(crate) struct MailboxInfo {
    pub(crate) exists: u32,
    pub(crate) recent: u32,
    pub(crate) uid_validity: u32,
    pub(crate) unseen: Option<u32>,
}

impl Conn {
    pub(crate) fn list(&mut self) -> Result<Vec<FolderInfo>, String> {
        let untagged = self.ok("LIST \"\" \"*\"")?;
        let mut out = Vec::new();
        for r in untagged {
            if let Some(f) = parse_list_line(&r.text) {
                out.push(f);
            }
        }
        Ok(out)
    }

    pub(crate) fn select(&mut self, mailbox: &str) -> Result<MailboxInfo, String> {
        let untagged = self.ok(&format!("SELECT {}", quote(mailbox)))?;
        let mut info = MailboxInfo::default();
        for r in &untagged {
            let t = r.text.trim();
            if let Some(rest) = t.strip_prefix("* ") {
                if let Some(v) = rest.strip_suffix(" EXISTS") {
                    info.exists = v.trim().parse().unwrap_or(0);
                } else if let Some(v) = rest.strip_suffix(" RECENT") {
                    info.recent = v.trim().parse().unwrap_or(0);
                } else if rest.to_ascii_uppercase().contains("UIDVALIDITY") {
                    info.uid_validity = bracket_number(rest, "UIDVALIDITY").unwrap_or(0);
                } else if rest.to_ascii_uppercase().contains("UNSEEN") {
                    info.unseen = bracket_number(rest, "UNSEEN");
                }
            }
        }
        Ok(info)
    }

    /// `STATUS <folder> (MESSAGES UNSEEN)` —— **极轻量**（163 实测 ~21ms，不用 SELECT、不拉邮件头），
    /// 实时接收就靠它探"有没有新邮件"。注意 163 不支持 UIDNEXT。
    pub(crate) fn status_counts(&mut self, folder: &str) -> Result<(u32, u32), String> {
        let untagged = self.ok(&format!("STATUS {} (MESSAGES UNSEEN)", quote(folder)))?;
        let text = untagged
            .iter()
            .map(|r| r.text.clone())
            .collect::<Vec<_>>()
            .join(" ");
        let messages = number_after(&text, "MESSAGES").unwrap_or(0);
        let unseen = number_after(&text, "UNSEEN").unwrap_or(0);
        Ok((messages, unseen))
    }
}

/// 解析 `* LIST (\Sent) "/" "&XfJT0ZAB-"`（含带引号的 delimiter 与名称）
pub(crate) fn parse_list_line(text: &str) -> Option<FolderInfo> {
    let rest = text.trim().strip_prefix("* LIST ")?;
    let attrs_start = rest.find('(')?;
    let attrs_end = rest[attrs_start..].find(')')? + attrs_start;
    let attrs = rest[attrs_start + 1..attrs_end].to_string();
    let after = rest[attrs_end + 1..].trim_start();
    let (delimiter, rest2) = read_token(after);
    let (name_opt, _) = read_token(rest2.trim_start());
    let name = name_opt?; // 名字为 NIL 的 LIST 行没有意义
    if name.is_empty() {
        return None;
    }
    let delimiter = delimiter.unwrap_or_else(|| "/".into());
    let decoded = decode_mutf7(&name);
    let selectable = !attrs.to_ascii_uppercase().contains("NOSELECT");
    Some(FolderInfo {
        special: special_of(&attrs, &name, &decoded),
        raw: name,
        name: decoded,
        delimiter,
        selectable,
    })
}

/// 读一个 IMAP 词元：带引号字符串返回 Some(内容)，`NIL` 返回 None
pub(crate) fn read_token(s: &str) -> (Option<String>, &str) {
    let t = s.trim_start();
    if let Some(rest) = t.strip_prefix('"') {
        let mut out = String::new();
        let mut escaped = false;
        for (i, c) in rest.char_indices() {
            if escaped {
                out.push(c);
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                return (Some(out), &rest[i + 1..]);
            } else {
                out.push(c);
            }
        }
        return (Some(out), "");
    }
    if t.to_ascii_uppercase().starts_with("NIL") {
        return (None, t[3..].trim_start());
    }
    let end = t.find(char::is_whitespace).unwrap_or(t.len());
    (Some(t[..end].to_string()), &t[end..])
}

/// 识别特殊文件夹：**优先用服务器给的 \Sent/\Drafts/\Trash/\Junk 属性**（最可靠），
/// 其次才按名字猜（中英文、网易/腾讯写法）。
pub(crate) fn special_of(attrs: &str, raw: &str, decoded: &str) -> String {
    let a = attrs.to_ascii_uppercase();
    let r = raw.to_ascii_uppercase();
    if r == "INBOX" || decoded == "收件箱" {
        return "inbox".into();
    }
    if a.contains("\\SENT") || a.contains("\\DRAFTS") || a.contains("\\TRASH") || a.contains("\\JUNK") {
        return if a.contains("\\SENT") {
            "sent".into()
        } else if a.contains("\\DRAFTS") {
            "drafts".into()
        } else if a.contains("\\TRASH") {
            "trash".into()
        } else {
            "junk".into()
        };
    }
    let n = decoded.to_lowercase();
    let has = |keys: &[&str]| keys.iter().any(|k| r.contains(&k.to_ascii_uppercase()) || n.contains(k));
    if has(&["sent", "已发送", "已发邮件"]) {
        "sent".into()
    } else if has(&["draft", "草稿"]) {
        "drafts".into()
    } else if has(&["trash", "deleted", "已删除", "垃圾箱"]) {
        "trash".into()
    } else if has(&["junk", "spam", "垃圾邮件", "广告邮件"]) {
        "junk".into()
    } else {
        String::new()
    }
}

/// IMAP 的日期格式：`28-Sep-2026`（英文月份缩写，不能用数字月）
pub(crate) fn imap_date(days_ago: u32) -> String {
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
        - (days_ago as i64) * 86_400;
    let (y, m, d) = civil_from_days(now.div_euclid(86_400));
    format!("{d:02}-{}-{y}", MONTHS[(m - 1) as usize])
}

/// 天数（自 1970-01-01）→ (年, 月, 日)，Howard Hinnant 算法
pub(crate) fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}
