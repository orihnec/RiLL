//! 实时接收：Rust 侧常驻线程（IDLE 推送 / STATUS 轮询），有新邮件就发事件给前端。

use std::sync::atomic::AtomicBool;
use std::time::Duration;
use std::sync::{Arc, Mutex};

use tauri::Emitter;

use crate::error::AppResult;

use super::imap::connect;
use super::model::{MailConfig, WatchEvent, WatchSpec};

pub(crate) static WATCHERS: Mutex<Option<WatcherMap>> = Mutex::new(None);

pub(crate) type WatchSink = Arc<dyn Fn(WatchEvent) + Send + Sync>;
pub(crate) type StopFlag = Arc<AtomicBool>;
type WatcherMap = std::collections::HashMap<String, (StopFlag, String)>;

pub(crate) fn watchers() -> std::sync::MutexGuard<'static, Option<WatcherMap>> {
    WATCHERS.lock().unwrap_or_else(|e| e.into_inner())
}

pub(crate) fn emit_watch(app: &tauri::AppHandle, ev: WatchEvent) {
        let _ = app.emit("mail://watch", ev);
}

/// 监听主循环：断线指数退避重连，连续失败 5 次就放弃（避免把服务端惹毛）。
pub(crate) fn watch_loop(spec: WatchSpec, sink: WatchSink, stop: StopFlag) {
    use std::sync::atomic::Ordering;
    let mut failures = 0u32;
    while !stop.load(Ordering::Relaxed) {
        match watch_session(&spec, &sink, &stop) {
            Ok(()) => break, // 被要求停止
            Err(e) => {
                failures += 1;
                sink(WatchEvent {
                        account_id: spec.account_id.clone(),
                        kind: "error".into(),
                        messages: 0,
                        unseen: 0,
                        previous: 0,
                        mode: String::new(),
                        message: format!("实时接收中断（第 {failures} 次）：{e}"),
                    },
                );
                if failures >= 5 {
                    sink(WatchEvent {
                        account_id: spec.account_id.clone(),
                        kind: "stopped".into(),
                        messages: 0,
                        unseen: 0,
                        previous: 0,
                        mode: String::new(),
                        message: "连续失败，已停止实时接收；可在邮箱面板点「重新监听」，或检查授权码".into(),
                    });
                    return;
                }
                // 5s → 10s → 20s → 40s → 60s
                let backoff = std::cmp::min(5u64 << (failures - 1).min(4), 60);
                interruptible_sleep(backoff, &stop);
            }
        }
    }
}

/// 睡眠，但能被停止标志打断（退出要快）
pub(crate) fn interruptible_sleep(seconds: u64, stop: &StopFlag) {
    use std::sync::atomic::Ordering;
    let step = Duration::from_millis(200);
    let mut left = Duration::from_secs(seconds.max(1));
    while left > Duration::ZERO {
        if stop.load(Ordering::Relaxed) {
            return;
        }
        let s = std::cmp::min(step, left);
        std::thread::sleep(s);
        left = left.saturating_sub(s);
    }
}

/// 一次连接会话：连接 → 选收件箱 → 循环（IDLE 推送 或 STATUS 轮询）。
pub(crate) fn watch_session(spec: &WatchSpec, sink: &WatchSink, stop: &StopFlag) -> AppResult<()> {
    use std::sync::atomic::Ordering;
    let cfg = MailConfig {
        host: spec.host.clone(),
        port: spec.port,
        security: if spec.security.is_empty() {
            "ssl".into()
        } else {
            spec.security.clone()
        },
        username: spec.username.clone(),
        password: spec.password.clone(),
    };
    let mut conn = connect(&cfg)?;
    let caps = conn.capability()?;
    let use_idle = caps.contains("IDLE");
    let mode = if use_idle { "idle" } else { "poll" };

    conn.select(&spec.folder)
        .map_err(|e| format!("打开 {} 失败：{e}", spec.folder))?;
    let mut last = conn.status_counts(&spec.folder)?;

    sink(WatchEvent {
        account_id: spec.account_id.clone(),
        kind: "ready".into(),
        messages: last.0,
        unseen: last.1,
        previous: last.0,
        mode: mode.into(),
        message: if use_idle {
            "已启用 IDLE 推送（服务器主动通知）".into()
        } else {
            format!("服务器不支持 IDLE，改为每 {} 秒查询一次", spec.interval_sec)
        },
    });

    loop {
        if stop.load(Ordering::Relaxed) {
            conn.logout();
            return Ok(());
        }
        if use_idle {
            let changed = conn.idle_once(Duration::from_secs(300), stop)?;
            let now = conn.status_counts(&spec.folder)?;
            if changed || now != last {
                let grew = now.0 > last.0;
                sink(WatchEvent {
                        account_id: spec.account_id.clone(),
                        kind: if grew { "changed".into() } else { "ready".into() },
                        messages: now.0,
                        unseen: now.1,
                        previous: last.0,
                        mode: mode.into(),
                        message: String::new(),
                    },
                );
                last = now;
            }
        } else {
            let now = conn.status_counts(&spec.folder)?;
            if now.0 > last.0 || now.1 > last.1 {
                sink(WatchEvent {
                        account_id: spec.account_id.clone(),
                        kind: "changed".into(),
                        messages: now.0,
                        unseen: now.1,
                        previous: last.0,
                        mode: mode.into(),
                        message: String::new(),
                    },
                );
                last = now;
            } else if now != last {
                // 邮件在别处被读了/删了：不提醒，但把计数同步给界面
                last = now;
            }
            interruptible_sleep(spec.interval_sec.max(5), stop);
        }
    }
}
