//! UID SEARCH / UID FETCH：取邮件头与正文的原始字节。

use super::{last_literal, number_after, paren_after, Conn};

pub(crate) struct FetchItem {
    pub(crate) uid: u32,
    pub(crate) flags: Vec<String>,
    pub(crate) size: u32,
    /// `BODY.PEEK[...]` 的字面量内容
    pub(crate) literal: Option<Vec<u8>>,
}

impl Conn {
    pub(crate) fn uid_search(&mut self, query: &str) -> Result<Vec<u32>, String> {
        let untagged = self.ok(&format!("UID SEARCH {query}"))?;
        let mut out = Vec::new();
        for r in &untagged {
            let t = r.text.trim();
            if let Some(rest) = t.strip_prefix("* SEARCH") {
                for tok in rest.split_whitespace() {
                    if let Ok(v) = tok.parse::<u32>() {
                        out.push(v);
                    }
                }
            }
        }
        out.sort_unstable();
        out.dedup();
        Ok(out)
    }

    /// UID FETCH，返回每条响应的元信息与字面量（正文/邮件头）。
    pub(crate) fn uid_fetch(&mut self, set: &str, items: &str) -> Result<Vec<FetchItem>, String> {
        let untagged = self.ok(&format!("UID FETCH {set} {items}"))?;
        let mut out = Vec::new();
        for r in &untagged {
            if !r.text.to_ascii_uppercase().contains("FETCH") {
                continue;
            }
            // 元信息都在字面量之前，按前缀解析即可
            let head = r.text.split("{").next().unwrap_or(&r.text);
            let uid = number_after(head, "UID").unwrap_or(0);
            if uid == 0 {
                continue;
            }
            let flags = paren_after(head, "FLAGS")
                .map(|s| s.split_whitespace().map(|x| x.to_string()).collect::<Vec<_>>())
                .unwrap_or_default();
            let size = number_after(head, "RFC822.SIZE").unwrap_or(0);
            out.push(FetchItem {
                uid,
                flags,
                size,
                literal: last_literal(&r.raw),
            });
        }
        Ok(out)
    }
}
