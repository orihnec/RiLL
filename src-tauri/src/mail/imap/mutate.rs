//! 改状态：STORE（已读/星标）、MOVE（移动）、IDLE（实时接收）。

use std::time::Duration;

use crate::error::{AppError, AppResult};

use super::super::model::MailConfig;
use super::super::watch::StopFlag;
use super::{connect, quote, Conn, IO_TIMEOUT};

    /// 进入 IDLE 并等待服务器推送；返回 true = 有新邮件（EXISTS/RECENT/FETCH）。
    /// 必须成对收尾：结束时发 DONE 并把这个 tag 的应答读干净，否则后续命令会标签错位。
impl Conn {
    pub(crate) fn idle_once(&mut self, max_wait: Duration, stop: &StopFlag) -> AppResult<bool> {
        use std::sync::atomic::Ordering;
        self.tag += 1;
        let tag = format!("a{}", self.tag);
        self.write_raw(format!("{tag} IDLE\r\n").as_bytes())?;

        // 服务器要先回 `+ idling`
        let first = self.read_reply()?;
        if !first.text.starts_with('+') {
            return Err(AppError::Other(format!("IDLE 未被接受：{}", first.text.trim())));
        }

        // 用短超时轮询，既能及时响应"停止"，也不会把线程卡死
        let _ = self
            .reader
            .get_mut()
            .get_ref()
            .set_read_timeout(Some(Duration::from_secs(2)));
        let deadline = std::time::Instant::now() + max_wait;
        let mut changed = false;
        while !changed && std::time::Instant::now() < deadline {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            match self.read_reply() {
                Ok(r) => {
                    let up = r.text.to_ascii_uppercase();
                    if up.contains("EXISTS") || up.contains("RECENT") || up.contains("FETCH") {
                        changed = true;
                    }
                }
                Err(_) => continue, // 读超时：正常，继续挂着
            }
        }

        // 收尾：DONE + 读干净（推送也可能正好在这时到）
        self.write_raw(b"DONE\r\n")?;
        let prefix = format!("{tag} ");
        for _ in 0..8 {
            match self.read_reply() {
                Ok(r) => {
                    let up = r.text.to_ascii_uppercase();
                    if up.contains("EXISTS") || up.contains("RECENT") || up.contains("FETCH") {
                        changed = true;
                    }
                    if r.text.starts_with(&prefix) {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = self.reader.get_mut().get_ref().set_read_timeout(Some(IO_TIMEOUT));
        Ok(changed)
    }
}

pub(crate) fn uid_set(uids: &[u32]) -> Result<String, String> {
    if uids.is_empty() {
        return Err("没有选中邮件".into());
    }
    Ok(uids.iter().map(|u| u.to_string()).collect::<Vec<_>>().join(","))
}

/// 已读/未读、星标：`UID STORE <set> +FLAGS.SILENT (\Seen)`。
/// 用 `.SILENT` 让服务器不回每条 FETCH 响应（更快，也不用解析一堆未标记响应）。
pub(crate) fn set_flags(
    cfg: &MailConfig,
    folder: &str,
    uids: &[u32],
    seen: Option<bool>,
    flagged: Option<bool>,
) -> AppResult<u32> {
    let set = uid_set(uids)?;
    let mut conn = connect(cfg)?;
    conn.select(folder)
        .map_err(|e| format!("打开文件夹失败：{e}"))?;
    if let Some(v) = seen {
        let op = if v { "+FLAGS.SILENT" } else { "-FLAGS.SILENT" };
        conn.ok(&format!("UID STORE {set} {op} (\\Seen)"))
            .map_err(|e| format!("更新已读状态失败：{e}"))?;
    }
    if let Some(v) = flagged {
        let op = if v { "+FLAGS.SILENT" } else { "-FLAGS.SILENT" };
        conn.ok(&format!("UID STORE {set} {op} (\\Flagged)"))
            .map_err(|e| format!("更新星标失败：{e}"))?;
    }
    conn.logout();
    Ok(uids.len() as u32)
}

/// 移动：COPY 到目标 → 源标记 \Deleted → 清空。
/// 优先 `UID EXPUNGE`（RFC 4315，只清我们刚标记的那些）；不支持时退回 `EXPUNGE`。
pub(crate) fn move_messages(cfg: &MailConfig, folder: &str, uids: &[u32], target: &str) -> AppResult<u32> {
    let set = uid_set(uids)?;
    if target.trim().is_empty() {
        return Err(AppError::Other("目标文件夹为空".into()));
    }
    let mut conn = connect(cfg)?;
    conn.select(folder)
        .map_err(|e| format!("打开文件夹失败：{e}"))?;
    conn.ok(&format!("UID COPY {set} {}", quote(target)))
        .map_err(|e| format!("复制到目标文件夹失败：{e}"))?;
    conn.ok(&format!("UID STORE {set} +FLAGS.SILENT (\\Deleted)"))
        .map_err(|e| format!("标记删除失败：{e}"))?;
    if conn.ok(&format!("UID EXPUNGE {set}")).is_err() {
        conn.ok("EXPUNGE")
            .map_err(|e| format!("清空已删除邮件失败：{e}"))?;
    }
    conn.logout();
    Ok(uids.len() as u32)
}