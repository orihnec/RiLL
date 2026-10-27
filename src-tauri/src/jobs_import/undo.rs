use super::{db::*, model::*};
use sqlx::{Connection, Row, SqliteConnection, SqlitePool};

async fn can_undo(conn: &mut SqliteConnection, batch: &str, audit: &RowResult) -> Result<bool, String> {
    if audit.undone { return Ok(false); }
    if job(conn, &audit.job_id).await? != Some(audit.after.clone()) { return Ok(false); }
    if binding(conn, &audit.binding_after.source_id, &audit.binding_after.identity_key).await? != Some(audit.binding_after.clone()) { return Ok(false); }
    let later: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM job_import_bindings b JOIN job_import_batches t ON t.id=b.last_batch_id
        WHERE b.job_id=? AND b.last_batch_id<>? AND t.committed_at >= (SELECT committed_at FROM job_import_batches WHERE id=?)")
        .bind(&audit.job_id).bind(batch).bind(batch).fetch_one(conn).await.map_err(db_error)?;
    Ok(later == 0)
}

async fn restore(conn: &mut SqliteConnection, audit: &mut RowResult) -> Result<(), String> {
    if audit.action == "create" {
        sqlx::query("DELETE FROM job_applications WHERE id=?").bind(&audit.job_id).execute(&mut *conn).await.map_err(db_error)?;
    } else if audit.action == "update" {
        let mut restored = audit.before.clone().ok_or("撤销快照缺失")?;
        restored.revision = audit.after.revision + 1;
        restored.updated_at = now();
        write_job(conn, &restored, false).await?;
    }
    if let Some(mut old) = audit.binding_before.clone() {
        old.revision = audit.binding_after.revision + 1;
        if audit.action == "update" { old.target_revision = audit.after.revision + 1; }
        write_binding(conn, &old).await?;
    } else {
        sqlx::query("DELETE FROM job_import_bindings WHERE source_id=? AND identity_key=?").bind(&audit.binding_after.source_id)
            .bind(&audit.binding_after.identity_key).execute(&mut *conn).await.map_err(db_error)?;
    }
    audit.undone = true;
    Ok(())
}

pub async fn undo(pool: &SqlitePool, batch: &str, apply: bool) -> Result<UndoPreview, String> {
    let mut connection = connection(pool).await?;
    let mut tx = connection.begin_with("BEGIN IMMEDIATE").await.map_err(db_error)?;
    let state: String = sqlx::query_scalar("SELECT state FROM job_import_batches WHERE id=?").bind(batch).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or("导入批次不存在")?;
    if !["committed", "partially_undone"].contains(&state.as_str()) { return Err("该批次不能撤销或已经撤销".into()); }
    let records = sqlx::query("SELECT row_key,result_json FROM job_import_rows WHERE batch_id=? AND result_json IS NOT NULL ORDER BY ordinal DESC").bind(batch).fetch_all(&mut *tx).await.map_err(db_error)?;
    let mut result = UndoPreview { eligible: 0, protected: 0, rows: vec![] };
    for record in records {
        let key: String = record.get("row_key");
        let mut audit: RowResult = parse(record.get::<&str,_>("result_json"))?;
        if audit.undone { continue; }
        let eligible = can_undo(&mut tx, batch, &audit).await?;
        if eligible { result.eligible += 1; } else { result.protected += 1; }
        result.rows.push(UndoRow { key: key.clone(), job_id: audit.job_id.clone(), action: audit.action.clone(), eligible,
            reason: if eligible { "可安全撤销".into() } else { "已被人工编辑、删除或后续导入触及，保留当前记录".into() } });
        if apply && eligible {
            restore(&mut tx, &mut audit).await?;
            sqlx::query("UPDATE job_import_rows SET result_json=? WHERE batch_id=? AND row_key=?").bind(json(&audit)?).bind(batch).bind(key).execute(&mut *tx).await.map_err(db_error)?;
        }
    }
    if apply {
        sqlx::query("UPDATE job_import_batches SET state=?,revision=revision+1 WHERE id=?").bind(if result.protected == 0 { "undone" } else { "partially_undone" })
            .bind(batch).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
    }
    Ok(result)
}
