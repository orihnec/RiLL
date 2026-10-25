//! 同步编排：探测账号 → 增量拉邮件头（UID 游标 + UIDVALIDITY）。

use crate::error::AppResult;

use super::imap::{connect, imap_date};
use super::mime::header_from_raw;
use super::model::{AccountProbe, HeaderBatch, MailConfig};

pub(crate) fn probe(cfg: &MailConfig) -> AppResult<AccountProbe> {
    let mut conn = connect(cfg)?;
    let folders = conn.list()?;
    // 收件箱未读数：SELECT 后 SEARCH UNSEEN
    let mut inbox_exists = 0;
    let mut uid_validity = 0;
    let mut inbox_unseen = 0;
    if let Ok(info) = conn.select("INBOX") {
        inbox_exists = info.exists;
        uid_validity = info.uid_validity;
        // ⚠️ SELECT 返回的 `[UNSEEN n]` 是**第一个未读邮件的序号**，不是未读数量
        // （RFC3501）。早先把它当数量用，163 上就出现"未读 763 封、读了也不减"。
        // 真正可靠的是 SEARCH UNSEEN 的结果条数。
        inbox_unseen = conn.uid_search("UNSEEN").map(|v| v.len() as u32).unwrap_or(0);
    }
    conn.logout();

    Ok(AccountProbe {
        display_name: cfg.username.clone(),
        folders: folders
            .into_iter()
            .filter(|f| f.selectable || f.special == "inbox")
            .collect(),
        inbox_exists,
        inbox_unseen,
        uid_validity,
    })
}

pub(crate) fn sync_headers(
    cfg: &MailConfig,
    folder: &str,
    since_days: u32,
    limit: u32,
    after_uid: Option<u32>,
) -> AppResult<HeaderBatch> {
    let mut conn = connect(cfg)?;
    let info = conn
        .select(folder)
        .map_err(|e| format!("打开文件夹失败：{e}"))?;

    // 增量优先：UID x:* 只取新的；首次按 SINCE 日期回溯
    let query = match after_uid {
        Some(u) => format!("UID {}:*", u.saturating_add(1)),
        None => format!("SINCE {}", imap_date(since_days)),
    };
    let mut uids = conn.uid_search(&query)?;
    if let Some(last) = after_uid {
        // n:* 在 n 超界时会回最后一封，这里过滤掉
        uids.retain(|u| *u > last);
    }
    if uids.len() > limit as usize {
        uids.drain(..uids.len() - limit as usize);
    }

    let mut headers = Vec::with_capacity(uids.len());
    for chunk in uids.chunks(50) {
        let set = chunk
            .iter()
            .map(|u| u.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let items = conn.uid_fetch(&set, "(UID FLAGS RFC822.SIZE BODY.PEEK[HEADER])")?;
        for it in items {
            let raw = match &it.literal {
                Some(b) => b,
                None => continue,
            };
            let seen = it.flags.iter().any(|f| f.eq_ignore_ascii_case("\\Seen"));
            let flagged = it.flags.iter().any(|f| f.eq_ignore_ascii_case("\\Flagged"));
            headers.push(header_from_raw(it.uid, it.size, seen, flagged, raw));
        }
    }
    conn.logout();

    Ok(HeaderBatch {
        uid_validity: info.uid_validity,
        exists: info.exists,
        headers,
    })
}
