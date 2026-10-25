//! RFC2047 编码字（`=?GBK?B?...?=`）解析：结构化扫描，不找第一个 `?=`。

use super::decode_bytes;
/// 解一个编码字 `=?charset?B|Q?payload?=`，**结构化解析**而不是找第一个 `?=`。
///
/// 为什么不能直接找 `?=`：Q 编码的 payload 经常**以 `=` 开头**（`=?gb2312?Q?=D0=A3=…?=`），
/// 分隔符的那个 `?` 加上 payload 首个 `=` 会被误判成结束标记（实测踩到，解不出中文）。
/// 正确做法：charset 到第一个 `?`、编码方式固定 1 个字符、再从 payload 内部找 `?=`
/// （RFC2047 规定 payload 里的 `?` 必须写成 `=3F`，所以内部第一个 `?=` 就是结束）。
pub(crate) fn parse_encoded_word(bytes: &[u8]) -> Option<(usize, String)> {
    if bytes.len() < 8 || bytes[0] != b'=' || bytes[1] != b'?' {
        return None;
    }
    let q1 = 2 + bytes[2..].iter().position(|b| *b == b'?')?;
    let charset = std::str::from_utf8(&bytes[2..q1]).ok()?;
    if q1 + 2 >= bytes.len() || bytes[q1 + 2] != b'?' {
        return None;
    }
    let encoding = bytes[q1 + 1].to_ascii_uppercase();
    let payload_start = q1 + 3;
    let end_rel = bytes[payload_start..]
        .windows(2)
        .position(|w| w == b"?=")?;
    let payload = &bytes[payload_start..payload_start + end_rel];
    let total = payload_start + end_rel + 2;

    let decoded = match encoding {
        b'B' => mail_parser::decoders::base64::base64_decode(payload)?,
        b'Q' => decode_q(payload),
        _ => return None,
    };
    Some((total, decode_bytes(&decoded, Some(charset))))
}

/// RFC2047 的 Q 编码：`_` = 空格，`=XX` = 十六进制字节
pub(crate) fn decode_q(payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(payload.len());
    let mut i = 0;
    while i < payload.len() {
        match payload[i] {
            b'_' => {
                out.push(b' ');
                i += 1;
            }
            b'=' if i + 2 < payload.len() => {
                match std::str::from_utf8(&payload[i + 1..i + 3])
                    .ok()
                    .and_then(|h| u8::from_str_radix(h, 16).ok())
                {
                    Some(v) => {
                        out.push(v);
                        i += 3;
                    }
                    None => {
                        out.push(payload[i]);
                        i += 1;
                    }
                }
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    out
}

/// 解一段可能包含多个编码字的文本（相邻编码字之间的空白按 RFC2047 丢掉）
pub(crate) fn decode_encoded_words(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = String::new();
    let mut i = 0;
    let mut last_was_word = false;
    while i < bytes.len() {
        if bytes[i] == b'=' && bytes.get(i + 1) == Some(&b'?') {
            if let Some((len, decoded)) = parse_encoded_word(&bytes[i..]) {
                out.push_str(&decoded);
                i += len;
                last_was_word = true;
                continue;
            }
        }
        // 编码字之间的空白要丢掉，普通文本照原样
        if last_was_word && (bytes[i] as char).is_whitespace() {
            let mut j = i;
            while j < bytes.len() && (bytes[j] as char).is_whitespace() {
                j += 1;
            }
            if j < bytes.len() && bytes[j] == b'=' && bytes.get(j + 1) == Some(&b'?') {
                i = j;
                continue;
            }
        }
        let ch = text[i..].chars().next().unwrap_or(' ');
        out.push(ch);
        i += ch.len_utf8();
        last_was_word = false;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn q_encoding_hex_and_underscore() {
        assert_eq!(decode_q(b"=E4=B8=AD"), "中".as_bytes().to_vec());
        assert_eq!(decode_q(b"a_b"), b"a b".to_vec());
    }

    #[test]
    fn q_encoding_keeps_isolated_equals() {
        assert_eq!(decode_q(b"a="), b"a=".to_vec());
        assert_eq!(decode_q(b"=ZZ"), b"=ZZ".to_vec());
    }

    #[test]
    fn parses_gbk_base64_word() {
        // =?GBK?B?0KM=?=  → GBK 的「校」(D0 A3)
        let (len, text) = parse_encoded_word(b"=?GBK?B?0KM=?=").expect("应能解析");
        assert_eq!(text, "校");
        assert_eq!(len, 14);
    }

    #[test]
    fn rejects_broken_word() {
        assert!(parse_encoded_word(b"=?").is_none());
        assert!(parse_encoded_word(b"=?GBK?X?abc?=").is_none());
    }

    #[test]
    fn joins_adjacent_words_and_drops_space() {
        assert_eq!(decode_encoded_words("=?utf-8?B?5Lit?= =?utf-8?B?5paH?="), "中文");
        assert_eq!(decode_encoded_words("前缀 =?utf-8?B?5Lit?= 后缀"), "前缀 中 后缀");
    }
}