use super::model::*;
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::Manager;

pub fn db_error(error: sqlx::Error) -> String {
    let code = error.as_database_error().and_then(|e| e.code()).map(|code| code.into_owned()).unwrap_or_default();
    format!("本地导入数据库操作失败（代码 {code}），本次事务未提交，请关闭其他写入后重试")
}
pub fn json<T: serde::Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| "无法保存导入数据".into())
}
pub fn parse<T: serde::de::DeserializeOwned>(value: &str) -> Result<T, String> {
    serde_json::from_str(value).map_err(|_| "导入批次数据无效，请重新生成预览".into())
}
pub fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}
pub async fn connection(pool: &SqlitePool) -> Result<sqlx::pool::PoolConnection<sqlx::Sqlite>, String> {
    let mut connection = pool.acquire().await.map_err(db_error)?;
    sqlx::query("PRAGMA busy_timeout=5000").execute(&mut *connection).await.map_err(db_error)?;
    Ok(connection)
}
pub async fn pool(app: &tauri::AppHandle) -> Result<SqlitePool, String> {
    let expected = app.path().app_data_dir().map_err(|_| "无法定位应用数据库")?.join("riliagent.db");
    let key = format!("sqlite:{}", expected.display()).replace('\\', "/").to_lowercase();
    let state = app.state::<tauri_plugin_sql::DbInstances>();
    let pools = state.0.read().await;
    let found = pools.iter().find(|(path, _)| path.replace('\\', "/").to_lowercase() == key);
    match found {
        Some((_, tauri_plugin_sql::DbPool::Sqlite(pool))) => Ok(pool.clone()),
        _ => Err("应用数据库尚未就绪，请稍后重试".into()),
    }
}
pub async fn status_snapshot(conn: &mut SqliteConnection) -> Result<Option<String>, String> {
    sqlx::query_scalar("SELECT value FROM app_settings WHERE key='job_statuses'").fetch_optional(conn).await.map_err(db_error)
}
pub fn status_ids(snapshot: &Option<String>) -> Result<Vec<String>, String> {
    let Some(raw) = snapshot else { return Ok(["preparing", "applied", "interviewing", "offer", "rejected", "archived"].map(String::from).to_vec()); };
    let value: serde_json::Value = parse(raw)?;
    value.as_array().ok_or("投递状态配置无效")?.iter().map(|item| item["id"].as_str().map(String::from).ok_or("投递状态配置无效".into())).collect()
}
pub async fn job(conn: &mut SqliteConnection, id: &str) -> Result<Option<JobSnapshot>, String> {
    let row = sqlx::query("SELECT * FROM job_applications WHERE id=?").bind(id).fetch_optional(conn).await.map_err(db_error)?;
    row.map(|r| Ok(JobSnapshot { id: r.get("id"), revision: r.get("revision"), updated_at: r.get("updated_at"), created_at: r.get("created_at"),
        values: JobValues { company: r.get("company"), position: r.get("position"), status: r.get("status"), url: r.get("url"), notes: r.get("notes"),
            applied_at: if r.get::<i64, _>("applied_at_known") == 0 { None } else { Some(r.get("applied_at")) },
            extras: r.get::<Option<String>, _>("extras_json").map(|raw| parse(&raw)).transpose()? } })).transpose()
}
pub async fn binding(conn: &mut SqliteConnection, source: &str, identity: &str) -> Result<Option<Binding>, String> {
    let row = sqlx::query("SELECT * FROM job_import_bindings WHERE source_id=? AND identity_key=?").bind(source).bind(identity).fetch_optional(conn).await.map_err(db_error)?;
    row.map(|r| Ok(Binding { source_id: r.get("source_id"), identity_key: r.get("identity_key"), job_id: r.get("job_id"),
        source_fingerprint: r.get("source_fingerprint"), last_source: parse(r.get::<&str,_>("last_source_json"))?,
        last_written: parse(r.get::<&str,_>("last_written_json"))?, target_revision: r.get("target_revision"),
        last_batch_id: r.get("last_batch_id"), revision: r.get("revision") })).transpose()
}
pub async fn write_binding(conn: &mut SqliteConnection, b: &Binding) -> Result<(), String> {
    sqlx::query("INSERT INTO job_import_bindings (source_id,identity_key,job_id,source_fingerprint,last_source_json,last_written_json,target_revision,last_batch_id,revision)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,identity_key) DO UPDATE SET job_id=excluded.job_id,source_fingerprint=excluded.source_fingerprint,
        last_source_json=excluded.last_source_json,last_written_json=excluded.last_written_json,target_revision=excluded.target_revision,last_batch_id=excluded.last_batch_id,revision=excluded.revision")
        .bind(&b.source_id).bind(&b.identity_key).bind(&b.job_id).bind(&b.source_fingerprint).bind(json(&b.last_source)?).bind(json(&b.last_written)?)
        .bind(b.target_revision).bind(&b.last_batch_id).bind(b.revision).execute(conn).await.map_err(db_error)?;
    Ok(())
}
pub async fn write_job(conn: &mut SqliteConnection, job: &JobSnapshot, create: bool) -> Result<(), String> {
    let v = &job.values;
    let extras = v.extras.as_ref().map(json).transpose()?;
    if create {
        sqlx::query("INSERT INTO job_applications (company,position,status,url,notes,applied_at,applied_at_known,extras_json,revision,updated_at,created_at,id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(&v.company).bind(&v.position).bind(&v.status).bind(&v.url).bind(&v.notes).bind(v.applied_at.unwrap_or(0)).bind(i64::from(v.applied_at.is_some()))
            .bind(extras).bind(job.revision).bind(job.updated_at).bind(job.created_at).bind(&job.id).execute(conn).await.map_err(db_error)?;
    } else {
        sqlx::query("UPDATE job_applications SET company=?,position=?,status=?,url=?,notes=?,applied_at=?,applied_at_known=?,extras_json=?,revision=?,updated_at=? WHERE id=?")
            .bind(&v.company).bind(&v.position).bind(&v.status).bind(&v.url).bind(&v.notes).bind(v.applied_at.unwrap_or(0)).bind(i64::from(v.applied_at.is_some()))
            .bind(extras).bind(job.revision).bind(job.updated_at).bind(&job.id).execute(conn).await.map_err(db_error)?;
    }
    Ok(())
}
