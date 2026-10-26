mod commit;
mod cleanup;
mod db;
mod model;
mod stage;
mod undo;
#[cfg(test)] mod tests;

use db::*;
use model::*;
use std::sync::OnceLock;

static BACKUP: OnceLock<tokio::sync::Mutex<bool>> = OnceLock::new();

#[tauri::command]
pub async fn jobs_import_backup(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let mut done = BACKUP.get_or_init(|| tokio::sync::Mutex::new(false)).lock().await;
    if *done { return Ok(()); }
    let pool = pool(&app).await?;
    let dir = app.path().app_data_dir().map_err(|_| "无法定位应用数据目录")?;
    // 在第一次 ALTER 之前制作 SQLite 一致快照，不复制正在使用的 db / WAL 文件。
    let backup = dir.join(format!("riliagent.pre-feishu-{}.db", now()));
    sqlx::query("VACUUM INTO ?").bind(backup.to_string_lossy().to_string()).execute(&pool).await.map_err(db_error)?;
    *done = true;
    Ok(())
}
#[tauri::command]
pub async fn jobs_import_stage(app: tauri::AppHandle, payload: StagePayload) -> Result<Batch, String> {
    stage::stage(&pool(&app).await?, payload).await
}
#[tauri::command]
pub async fn jobs_import_commit(app: tauri::AppHandle, batch_id: String, preview_hash: String, revision: i64, selected_row_keys: Vec<String>) -> Result<ImportResult, String> {
    commit::commit(&pool(&app).await?, &batch_id, &preview_hash, revision, selected_row_keys, None).await
}
#[tauri::command]
pub async fn jobs_import_undo_preview(app: tauri::AppHandle, batch_id: String) -> Result<UndoPreview, String> {
    undo::undo(&pool(&app).await?, &batch_id, false).await
}
#[tauri::command]
pub async fn jobs_import_undo(app: tauri::AppHandle, batch_id: String) -> Result<UndoPreview, String> {
    undo::undo(&pool(&app).await?, &batch_id, true).await
}
#[tauri::command]
pub async fn jobs_import_cleanup(app: tauri::AppHandle, batch_id: String) -> Result<(), String> {
    cleanup::cleanup(&pool(&app).await?, &batch_id).await
}
