//! HTML → 纯文本（只用于全文检索 / AI 提取 / 没有 HTML 时的兜底展示；渲染仍走消毒后的 HTML）。
pub(crate) fn looks_like_html(s: &str) -> bool {
    let head: String = s.chars().take(200).collect::<String>().to_ascii_lowercase();
    head.contains("<!doctype html") || head.contains("<html") || head.contains("<body") || head.contains("<div")
}

/// 粗剥 HTML 标签得到纯文本（解码常见实体 + 保留段落换行）。
/// 只用于 `text`（搜索 / AI 提取 / 无 HTML 时的兜底展示），渲染仍走消毒后的 HTML。
pub(crate) fn html_to_text(html: &str) -> String {
    let chars: Vec<char> = html.chars().collect();
    let mut out = String::with_capacity(html.len() / 3);
    let mut in_tag = false;
    let mut skip_depth = 0usize; // <style>/<script> 整段跳过
    let mut tag = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if in_tag {
            if c == '>' {
                let t = tag.to_ascii_lowercase();
                let closing = t.starts_with('/');
                if t.starts_with("style") || t.starts_with("script") {
                    skip_depth += 1;
                } else if closing && (t.contains("style") || t.contains("script")) {
                    skip_depth = skip_depth.saturating_sub(1);
                } else if closing
                    || t.starts_with("br")
                    || t.starts_with("p")
                    || t.starts_with("div")
                    || t.starts_with("tr")
                    || t.starts_with("li")
                    || t.starts_with("h1")
                    || t.starts_with("h2")
                    || t.starts_with("h3")
                    || t.starts_with("table")
                {
                    if !out.ends_with('\n') {
                        out.push('\n');
                    }
                }
                tag.clear();
                in_tag = false;
            } else {
                tag.push(c);
            }
            i += 1;
            continue;
        }
        match c {
            '<' => in_tag = true,
            '&' => {
                let rest: String = chars[i..].iter().take(10).collect();
                let (entity, len) = decode_entity(&rest);
                if skip_depth == 0 {
                    out.push_str(&entity);
                }
                i += len;
                continue;
            }
            _ => {
                if skip_depth == 0 {
                    out.push(c);
                }
            }
        }
        i += 1;
    }
    // 去多余空白：逐行 trim、丢空行
    out.lines()
        .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// 常见 HTML 实体（返回替换文本与消耗的字符数）
pub(crate) fn decode_entity(rest: &str) -> (String, usize) {
    const TABLE: [(&str, &str); 8] = [
        ("&nbsp;", " "),
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", "\""),
        ("&#39;", "'"),
        ("&apos;", "'"),
        ("&mdash;", "—"),
    ];
    for (k, v) in TABLE {
        if rest.starts_with(k) {
            return (v.to_string(), k.chars().count());
        }
    }
    // &#123; / &#x1F600; 数字实体
    if let Some(body) = rest.strip_prefix("&#") {
        let digits: String = body.chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
        let consumed = 2 + digits.len() + usize::from(body.chars().nth(digits.len()) == Some(';'));
        let value = if let Some(hex) = digits.strip_prefix(['x', 'X']) {
            u32::from_str_radix(hex, 16).ok()
        } else {
            digits.parse::<u32>().ok()
        };
        if let Some(v) = value.and_then(char::from_u32) {
            return (v.to_string(), consumed);
        }
    }
    ("&".to_string(), 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_script_and_style() {
        let text = html_to_text("<style>p{color:red}</style><script>x()</script><p>你好</p>");
        assert_eq!(text, "你好");
    }

    #[test]
    fn decodes_named_and_numeric_entities() {
        assert_eq!(decode_entity("&nbsp;rest").0, " ");
        assert_eq!(decode_entity("&#x1F600;").0, "😀");
        assert_eq!(decode_entity("&#20013;").0, "中");
        assert_eq!(decode_entity("&bogus;").0, "&");
    }

    #[test]
    fn collapses_blank_lines() {
        assert_eq!(html_to_text("<div>a</div>\n\n<div>b</div>"), "a\nb");
    }

    #[test]
    fn detects_html_documents() {
        assert!(looks_like_html("<!DOCTYPE html><html><body>x"));
        assert!(!looks_like_html("普通纯文本邮件内容"));
    }
}