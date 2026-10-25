//! IMAP 报文里的小工具：带引号字符串、状态码解析、字面量切分、错误提示。
//!
//! 全是纯函数（不碰 IO），改这里不会影响连接状态机。
/// IMAP 带引号字符串：反斜杠与引号要转义（授权码里可能出现）
pub(crate) fn quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        if c == '\\' || c == '"' {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('"');
    out
}

pub(crate) fn first_word(command: &str) -> &str {
    command.split_whitespace().next().unwrap_or(command)
}

/// `* OK ...` / `* PREAUTH ...` 都算可继续的问候
pub(crate) fn is_ok_greeting(greeting: &str) -> bool {
    let up = greeting.trim_start().to_ascii_uppercase();
    up.starts_with("* OK") || up.starts_with("* PREAUTH")
}

/// 行尾是 `{123}` 或 `{123+}` 时返回字面量长度
pub(crate) fn trailing_literal_size(line: &[u8]) -> Option<usize> {
    let s = String::from_utf8_lossy(line);
    let trimmed = s.trim_end_matches(['\r', '\n']);
    let start = trimmed.rfind('{')?;
    let end = trimmed.rfind('}')?;
    if end < start {
        return None;
    }
    let inner = trimmed[start + 1..end].trim_end_matches('+');
    inner.parse::<usize>().ok()
}

/// 取响应里最后一个字面量（FETCH 的正文/邮件头）
pub(crate) fn last_literal(raw: &[u8]) -> Option<Vec<u8>> {
    // 找最后一个 `{N}` 后紧跟的 CRLF，再取 N 字节
    let text = String::from_utf8_lossy(raw);
    let mut best: Option<(usize, usize)> = None; // (数据起点, 长度)
    let bytes = raw;
    let s = text.as_bytes();
    let mut i = 0;
    while i < s.len() {
        if s[i] == b'{' {
            if let Some(close) = s[i..].iter().position(|c| *c == b'}') {
                let inner = &text[i + 1..i + close];
                if let Ok(size) = inner.trim_end_matches('+').parse::<usize>() {
                    let mut start = i + close + 1;
                    if s.get(start) == Some(&b'\r') {
                        start += 1;
                    }
                    if s.get(start) == Some(&b'\n') {
                        start += 1;
                    }
                    if start + size <= bytes.len() {
                        best = Some((start, size));
                    }
                    i = start + size;
                    continue;
                }
            }
        }
        i += 1;
    }
    best.map(|(start, size)| bytes[start..start + size].to_vec())
}

/// `[UIDVALIDITY 1]` 里的数字
pub(crate) fn bracket_number(text: &str, key: &str) -> Option<u32> {
    let upper = text.to_ascii_uppercase();
    let pos = upper.find(&key.to_ascii_uppercase())?;
    text[pos + key.len()..]
        .split(|c: char| !c.is_ascii_digit())
        .find(|s| !s.is_empty())
        .and_then(|s| s.parse().ok())
}

/// `KEY 123` 里的数字（如 `UID 42`、`RFC822.SIZE 2048`）
pub(crate) fn number_after(text: &str, key: &str) -> Option<u32> {
    let upper = text.to_ascii_uppercase();
    let pos = upper.find(&key.to_ascii_uppercase())?;
    let rest = &text[pos + key.len()..];
    let digits: String = rest
        .trim_start_matches(|c: char| !c.is_ascii_digit())
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

/// `FLAGS (\Seen \Flagged)` 里的括号内容
pub(crate) fn paren_after(text: &str, key: &str) -> Option<String> {
    let upper = text.to_ascii_uppercase();
    let pos = upper.find(&key.to_ascii_uppercase())?;
    let rest = &text[pos + key.len()..];
    let start = rest.find('(')?;
    let end = rest[start..].find(')')? + start;
    Some(rest[start + 1..end].to_string())
}

pub(crate) fn needs_id(host: &str) -> bool {
    let h = host.to_ascii_lowercase();
    h.contains("163.com") || h.contains("126.com") || h.contains("yeah.net") || h.contains("188.com")
}

pub(crate) fn network_hint(host: &str, port: u16, err: &str) -> String {
    let mut msg = format!("连接 {host}:{port} 失败：{err}");
    if err.to_lowercase().contains("certificate") {
        msg.push_str("（TLS 证书校验失败：确认主机名是否正确；自签证书的企业邮箱暂不支持）");
    } else if port == 993 {
        msg.push_str("（确认已开启 IMAP 服务：QQ/163 需在网页版设置里开启并生成授权码）");
    }
    msg
}

pub(crate) fn login_hint(status: &str) -> String {
    let upper = status.to_ascii_uppercase();
    if upper.contains("AUTHENTICATIONFAILED") || upper.contains("LOGIN") || upper.contains("AUTH") {
        format!("登录被拒绝：{status}（QQ/163 用的是「授权码」而不是登录密码，请到邮箱设置 → 账户 → 开启 IMAP 后生成）")
    } else {
        format!("登录失败：{status}")
    }
}
