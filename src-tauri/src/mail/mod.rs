//! mail 模块：IMAP 读信。**分层**：命令 → sync/body/watch → imap + mime/encoding → TLS。
//!
//! 为什么自己实现 IMAP：IMAP 是 TCP+TLS，webview 里的 JS 碰不到；而 imap 2.4 有两个
//! 致命问题（163 实测）：解析不了 * ID (...) 且不读干净后续应答 → 标签错位；标签不匹配
//! 时用 ssert_eq! 直接 panic。MIME 解析仍交给 mail-parser。
//!
//! 踩过的坑（改代码前先看）：
//! - 网易系必须在 SELECT 前发 ID，否则 NO SELECT Unsafe Login；
//! - 文件夹名是 modified UTF-7，SELECT 用原名、显示用解码名；
//! - 响应里有 {N} 字面量，必须按字节精确读取；
//! - SELECT 的 [UNSEEN n] 是**首个未读的序号**，不是未读数量。

mod body;
mod encoding;
pub(crate) mod html;
mod imap;
mod mime;
mod model;
mod sync;
mod watch;

pub use model::*;

use crate::error::AppResult;

use body::*;
use imap::*;
use sync::*;
use watch::*;

/// IMAP 是同步阻塞 IO：放到 Tauri 的阻塞线程池，别卡住 UI 线程。
///
/// 错误类型放开成 `E: Display`：底层有的返回 `AppError`、有的还返回 `String`，
/// 这里只负责"搬到阻塞线程 + 把 panic 变成可读错误"，不强制统一。
pub(crate) async fn blocking<T, E, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    E: std::fmt::Display + Send + 'static,
    F: FnOnce() -> Result<T, E> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("后台任务执行失败：{e}"))?
        .map_err(|e| e.to_string())
}

/* ---------------- Tauri 命令（唯一允许把错误转成 String 的地方） ---------------- */

#[tauri::command]
pub async fn mail_test_account(cfg: MailConfig) -> AppResult<AccountProbe> {
    Ok(blocking(move || probe(&cfg)).await?)
}

#[tauri::command]
pub async fn mail_sync_headers(
    cfg: MailConfig,
    folder: String,
    since_days: u32,
    limit: u32,
    after_uid: Option<u32>,
) -> AppResult<HeaderBatch> {
    Ok(blocking(move || sync_headers(&cfg, &folder, since_days, limit, after_uid)).await?)
}

#[tauri::command]
pub async fn mail_fetch_body(cfg: MailConfig, folder: String, uid: u32) -> AppResult<MailBody> {
    Ok(blocking(move || fetch_body(&cfg, &folder, uid)).await?)
}

#[tauri::command]
pub async fn mail_save_attachment(
    cfg: MailConfig,
    folder: String,
    uid: u32,
    index: u32,
    path: String,
) -> AppResult<u32> {
    Ok(blocking(move || save_attachment(&cfg, &folder, uid, index, &path)).await?)
}

#[tauri::command]
pub async fn mail_set_flags(
    cfg: MailConfig,
    folder: String,
    uids: Vec<u32>,
    seen: Option<bool>,
    flagged: Option<bool>,
) -> AppResult<u32> {
    Ok(blocking(move || set_flags(&cfg, &folder, &uids, seen, flagged)).await?)
}

#[tauri::command]
pub async fn mail_move(
    cfg: MailConfig,
    folder: String,
    uids: Vec<u32>,
    target: String,
) -> AppResult<u32> {
    Ok(blocking(move || move_messages(&cfg, &folder, &uids, &target)).await?)
}

#[tauri::command]
pub async fn mail_watch_apply(app: tauri::AppHandle, specs: Vec<WatchSpec>) -> AppResult<Vec<String>> {
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    let mut guard = watchers();
    let map = guard.get_or_insert_with(std::collections::HashMap::new);

    let wanted: std::collections::HashMap<String, String> = specs
        .iter()
        .map(|s| {
            (
                s.account_id.clone(),
                format!(
                    "{}|{}|{}|{}|{}|{}",
                    s.host, s.port, s.security, s.username, s.folder, s.interval_sec
                ),
            )
        })
        .collect();

    // 1) 停掉已被移除或配置变化的
    let mut to_stop: Vec<String> = Vec::new();
    for (id, (_, sig)) in map.iter() {
        match wanted.get(id) {
            Some(want) if want == sig => {}
            _ => to_stop.push(id.clone()),
        }
    }
    for id in to_stop {
        if let Some((flag, _)) = map.remove(&id) {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }

    // 2) 启动新增的
    let mut started: Vec<String> = Vec::new();
    for spec in specs {
        let id = spec.account_id.clone();
        if map.contains_key(&id) {
            continue;
        }
        let flag: StopFlag = Arc::new(AtomicBool::new(false));
        map.insert(id.clone(), (flag.clone(), wanted[&id].clone()));
        started.push(id.clone());
        let app = app.clone();
        let sink: WatchSink = Arc::new(move |ev| emit_watch(&app, ev));
        std::thread::Builder::new()
            .name(format!("mail-watch-{id}"))
            .spawn(move || watch_loop(spec, sink, flag))
            .map_err(|e| format!("启动监听线程失败：{e}"))?;
    }
    Ok(started)
}

#[tauri::command]
pub async fn mail_watch_stop() -> AppResult<()> {
    let mut guard = watchers();
    if let Some(map) = guard.as_mut() {
        for (_, (flag, _)) in map.iter() {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
        }
        map.clear();
    }
    Ok(())
}

#[cfg(test)]
mod tests;
