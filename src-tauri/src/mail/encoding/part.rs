//! MIME part 的原始字节与传输编码（base64 / quoted-printable）处理。

use mail_parser::MessagePart;

use super::decode_bytes;
/// 取 MIME part 声明的字符集
pub(crate) fn part_charset(part: &MessagePart<'_>) -> Option<String> {
    use mail_parser::MimeHeaders;
    part.content_type()
        .and_then(|c| c.attribute("charset"))
        .map(|s| s.to_string())
}

/// 从原始报文里按 offset 切出 part 的**原始编码字节**。
///
/// 为什么不用 `part.contents()`：它返回的是 mail-parser 按（可能错误的）字符集**有损转码**后的
/// UTF-8 字节 —— 无效序列已经变成 U+FFFD，再想用 GB18030 救就晚了：
/// 会解出「锟斤拷」这种二次乱码（U+FFFD 的 UTF-8 字节 EF BF BD 被当 GBK 读）。
pub(crate) fn raw_encoded_body<'a>(raw: &'a [u8], part: &MessagePart<'_>) -> &'a [u8] {
    let start = part.offset_body as usize;
    let end = (part.offset_end as usize).min(raw.len());
    if start >= end {
        return &[];
    }
    &raw[start..end]
}

/// 传输编码（Content-Transfer-Encoding）解码：base64 / quoted-printable / 原样。
/// 用 mail-parser 公开的 decoders（它内部同一套实现），拿到的就是真正的原始内容字节。
pub(crate) fn decode_transfer(part: &MessagePart<'_>, encoded: &[u8]) -> Vec<u8> {
    use mail_parser::MimeHeaders;
    match part.content_transfer_encoding().map(|e| e.to_ascii_lowercase()) {
        Some(e) if e == "base64" => {
            mail_parser::decoders::base64::base64_decode(encoded).unwrap_or_else(|| encoded.to_vec())
        }
        Some(e) if e == "quoted-printable" => {
            mail_parser::decoders::quoted_printable::quoted_printable_decode(encoded)
                .unwrap_or_else(|| encoded.to_vec())
        }
        _ => encoded.to_vec(),
    }
}

/// 解码一个文本 part：原始字节 → 传输编码解码 → 字符集嗅探打分。
pub(crate) fn decode_part(part: &MessagePart<'_>, raw: &[u8]) -> String {
    let bytes = decode_transfer(part, raw_encoded_body(raw, part));
    decode_bytes(&bytes, part_charset(part).as_deref())
}
