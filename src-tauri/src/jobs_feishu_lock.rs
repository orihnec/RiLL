use std::{collections::HashMap, fs::{File, OpenOptions}, path::PathBuf, sync::{Mutex, OnceLock}, time::{Duration, Instant}};
use tauri::Manager;

type HeldLocks = Mutex<HashMap<String, File>>;
static LOCKS: OnceLock<HeldLocks> = OnceLock::new();
fn locks() -> &'static HeldLocks { LOCKS.get_or_init(|| Mutex::new(HashMap::new())) }
fn lock_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|_| "无法定位飞书凭据锁")?.join("feishu-credentials.lock"))
}
fn acquire(path: PathBuf) -> Result<File, String> {
    let file = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(path).map_err(|_| "无法打开飞书凭据锁")?;
    let deadline = Instant::now() + Duration::from_secs(35);
    loop {
        match file.try_lock() {
            Ok(()) => return Ok(file),
            Err(std::fs::TryLockError::WouldBlock) => {
                if Instant::now() >= deadline { return Err("另一个窗口正在更新飞书授权，请稍后重试；若窗口已崩溃，请退出并重启 Rill".into()); }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(_) => return Err("无法锁定飞书凭据，请检查应用数据目录权限".into()),
        }
    }
}
#[tauri::command]
pub async fn jobs_feishu_credentials_acquire(app: tauri::AppHandle, lease: String) -> Result<(), String> {
    if lease.len() != 64 || !lease.bytes().all(|c| c.is_ascii_hexdigit()) { return Err("凭据操作标识无效".into()); }
    {
        let held = locks().lock().map_err(|_| "凭据锁状态无效")?;
        // 不按时间强制解锁，避免挂起的旧请求恢复后覆盖新令牌；进程退出会自动释放。
        if held.contains_key(&lease) { return Err("凭据操作标识重复".into()); }
    }
    let path = lock_path(&app)?;
    let file = tauri::async_runtime::spawn_blocking(move || acquire(path)).await.map_err(|_| "凭据锁任务失败")??;
    locks().lock().map_err(|_| "凭据锁状态无效")?.insert(lease, file);
    Ok(())
}
#[tauri::command]
pub fn jobs_feishu_credentials_release(lease: String) -> Result<(), String> {
    locks().lock().map_err(|_| "凭据锁状态无效")?.remove(&lease);
    // 句柄关闭自动释放跨进程系统文件锁；锁文件不保存任何凭据，也不删除以免发生换文件竞态。
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn operating_system_lock_serializes_separate_handles() {
        let suffix=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let path=std::env::temp_dir().join(format!("rill-feishu-lock-{}-{suffix}.test",std::process::id()));
        let first=acquire(path.clone()).unwrap();
        let second=OpenOptions::new().read(true).write(true).open(&path).unwrap();
        assert!(matches!(second.try_lock(),Err(std::fs::TryLockError::WouldBlock)));
        drop(first);
        assert!(second.try_lock().is_ok()); drop(second);
        std::fs::remove_file(path).unwrap();
    }
}
