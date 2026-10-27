use super::db::*;
use sqlx::{Connection, SqlitePool};

pub async fn cleanup(pool: &SqlitePool, batch: &str) -> Result<(), String> {
    let mut connection = connection(pool).await?;
    let mut tx = connection.begin_with("BEGIN IMMEDIATE").await.map_err(db_error)?;
    let state: String = sqlx::query_scalar("SELECT state FROM job_import_batches WHERE id=?").bind(batch).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or("导入批次不存在")?;
    let next = if state == "ready" { "canceled" } else { "purged" };
    sqlx::query("DELETE FROM job_import_rows WHERE batch_id=?").bind(batch).execute(&mut *tx).await.map_err(db_error)?;
    sqlx::query("UPDATE job_import_batches SET state=?,revision=revision+1 WHERE id=?").bind(next).bind(batch).execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(())
}
