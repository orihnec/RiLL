//! 编码与头部解码：**纯函数，不做 IO**。
//!
//! 顺序见 `decode_bytes`：声明字符集 → UTF-8 → GB18030 → windows-1252，
//! 每一步都先判断"像不像乱码"再决定是否采用（既能纠没声明 charset，也能纠声明错了）。

mod mojibake;

pub(crate) use mojibake::looks_like_mojibake;
mod part;
mod word;

pub(crate) use part::*;
pub(crate) use word::*;

use base64::Engine;
use encoding_rs::Encoding;
use mojibake::badness;
/**
 * 解码正文/头部字节。顺序：**声明的字符集 → UTF-8 → GB18030 → windows-1252**，
 * 每一步都先看"像不像乱码"，像就继续往下试（这样既能纠"没声明 charset"，
 * 也能纠"声明成 utf-8 但内容是 GBK"）。
 */
pub(crate) fn decode_bytes(bytes: &[u8], declared: Option<&str>) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    // 纯 ASCII（含 RFC2047 编码字的信封部分）不用猜
    if bytes.iter().all(|b| b.is_ascii()) {
        return String::from_utf8_lossy(bytes).into_owned();
    }

    let declared_text = declared.and_then(|label| {
        let label = label.trim().trim_matches('"').trim();
        Encoding::for_label(label.as_bytes()).map(|enc| {
            let (s, _, _) = enc.decode(bytes);
            s.into_owned()
        })
    });
    if let Some(s) = &declared_text {
        if !looks_like_mojibake(s) {
            return s.clone();
        }
    }

    let utf8_text = std::str::from_utf8(bytes).ok().map(|s| s.to_string());
    if let Some(s) = &utf8_text {
        if !looks_like_mojibake(s) {
            return s.clone();
        }
    }

    // GB18030 是 GBK/GB2312 的超集，国内邮件的主力编码
    let (gb, _, _) = encoding_rs::GB18030.decode(bytes);
    let gb = gb.into_owned();
    if !looks_like_mojibake(&gb) {
        return gb;
    }

    // 全都不干净：取"最不脏"的（GB18030 优先，因为中文场景概率最高）
    let (win, _, _) = encoding_rs::WINDOWS_1252.decode(bytes);
    let mut best = gb;
    let mut best_bad = badness(&best);
    for cand in [win.into_owned(), declared_text.unwrap_or_default(), utf8_text.unwrap_or_default()] {
        let bad = badness(&cand);
        if bad < best_bad {
            best_bad = bad;
            best = cand;
        }
    }
    best
}

/// 从原始头块里取某个头字段的原始字节（支持折行续行），用于修 8-bit 明文头。
pub(crate) fn raw_header_value(raw: &[u8], name: &str) -> Option<Vec<u8>> {
    let name_lower = name.to_ascii_lowercase();
    let mut lines: Vec<&[u8]> = raw.split(|b| *b == b'\n').collect();
    if lines.is_empty() {
        return None;
    }
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].strip_suffix(b"\r").unwrap_or(lines[i]);
        let head_len = name_lower.len();
        if line.len() > head_len + 1
            && line[..head_len].eq_ignore_ascii_case(name_lower.as_bytes())
            && line[head_len] == b':'
        {
            let mut value = line[head_len + 1..].to_vec();
            // 续行：以空格/制表符开头的行属于同一个头（展开时用**一个空格**连接，
            // 不能把续行自己的前导空白也带上，否则会出现两个空白）
            let mut j = i + 1;
            while j < lines.len() {
                let next = lines[j].strip_suffix(b"\r").unwrap_or(lines[j]);
                if next.first().map(|b| *b == b' ' || *b == b'\t').unwrap_or(false) {
                    value.push(b' ');
                    let trimmed: &[u8] = {
                        let mut k = 0;
                        while k < next.len() && (next[k] == b' ' || next[k] == b'\t') {
                            k += 1;
                        }
                        &next[k..]
                    };
                    value.extend_from_slice(trimmed);
                    j += 1;
                } else {
                    break;
                }
            }
            lines.truncate(0); // 明确不再需要
            return Some(value);
        }
        i += 1;
    }
    None
}

/// 8-bit 明文头（GBK 主题/发件人）解码；RFC2047 编码字也**自己解**
/// （实测 mail-parser 会把 `=?gb2312?B?…?=` 按 UTF-8 解成乱码，不能信它）。
pub(crate) fn decode_header_text(bytes: &[u8]) -> String {
    let base = if bytes.iter().all(|b| b.is_ascii()) {
        String::from_utf8_lossy(bytes).to_string()
    } else {
        decode_bytes(bytes, None)
    };
    let text = if base.contains("=?") {
        decode_encoded_words(&base)
    } else {
        base
    };
    text.trim().to_string()
}

pub(crate) fn decode_raw_header(raw: &[u8], name: &str, fallback: &str) -> String {
    let Some(bytes) = raw_header_value(raw, name) else {
        return fallback.to_string();
    };
    let decoded = decode_header_text(&bytes);
    if decoded.is_empty() {
        fallback.to_string()
    } else {
        decoded
    }
}

/// 从原始 `From:` 头里取显示名（8-bit GBK 时 mail-parser 会给乱码）。
pub(crate) fn raw_display_name(raw: &[u8], header: &str, fallback: &str) -> String {
    let decoded = decode_raw_header(raw, header, "");
    if decoded.is_empty() {
        return fallback.to_string();
    }
    let name = match decoded.find('<') {
        Some(pos) => decoded[..pos].trim().trim_matches('"').trim().to_string(),
        None => decoded.trim().to_string(),
    };
    if name.is_empty() || name.contains('@') {
        fallback.to_string()
    } else {
        name
    }
}

/// IMAP 的 mailbox 名是 modified UTF-7：`&XfJT0ZAB-` = 「已发送」。
pub(crate) fn decode_mutf7(input: &str) -> String {
    if !input.contains('&') {
        return input.to_string();
    }
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut b64 = String::new();
    while let Some(c) = chars.next() {
        if c == '&' {
            b64.clear();
            while let Some(&n) = chars.peek() {
                chars.next();
                if n == '-' {
                    break;
                }
                // modified base64：',' 代替 '/'
                b64.push(if n == ',' { '/' } else { n });
            }
            // `&-`（或结尾孤立 `&`）= 字面 &
            if b64.is_empty() {
                out.push('&');
                continue;
            }
            while b64.len() % 4 != 0 {
                b64.push('=');
            }
            match base64::engine::general_purpose::STANDARD.decode(b64.as_bytes()) {
                Ok(bytes) if bytes.len() % 2 == 0 => {
                    let units: Vec<u16> = bytes
                        .chunks_exact(2)
                        .map(|p| u16::from_be_bytes([p[0], p[1]]))
                        .collect();
                    match String::from_utf16(&units) {
                        Ok(s) => out.push_str(&s),
                        Err(_) => out.push_str(&format!("&{b64}-")),
                    }
                }
                _ => out.push_str(&format!("&{b64}-")),
            }
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gbk_bytes_decode_without_charset() {
        // GBK 的「校」= D0 A3，且没有声明 charset
        assert_eq!(decode_bytes(&[0xD0, 0xA3], None), "校");
    }

    #[test]
    fn utf8_wins_when_valid() {
        assert_eq!(decode_bytes("中文".as_bytes(), None), "中文");
    }

    #[test]
    fn empty_and_ascii_are_fast_paths() {
        assert_eq!(decode_bytes(b"", None), "");
        assert_eq!(decode_bytes(b"hello", Some("utf-8")), "hello");
    }

    #[test]
    fn declared_charset_is_used_when_clean() {
        assert_eq!(decode_bytes(&[0xD0, 0xA3], Some("gb2312")), "校");
    }

    #[test]
    fn folded_header_joins_with_single_space() {
        let raw = b"Subject: hello\r\n world\r\nOther: x\r\n";
        let folded = String::from_utf8(raw_header_value(raw, "subject").unwrap()).unwrap();
        assert_eq!(folded.trim(), "hello world");
    }

    #[test]
    fn missing_header_falls_back() {
        assert_eq!(decode_raw_header(b"Other: x\r\n", "Subject", "(无主题)"), "(无主题)");
    }
}