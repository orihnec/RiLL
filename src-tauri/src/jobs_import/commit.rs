use super::{db::*, model::*, stage::validate_values};
use sqlx::{Connection, Row, SqliteConnection, SqlitePool};
use std::collections::HashSet;

async fn apply_row(conn: &mut SqliteConnection, batch: &str, source: &str, row: &FrozenRow) -> Result<RowResult, String> {
    let identity = row.identity_key.as_ref().ok_or("记录缺少稳定身份")?;
    let current_binding = binding(conn, source, identity).await?;
    if current_binding != row.binding { return Err("来源绑定已被另一次导入更新，请重新生成预览".into()); }
    let before = job(conn, &row.job_id).await?;
    if before != row.expected { return Err("投递已在其他窗口被修改或删除，请重新生成预览".into()); }
    if row.action == "create" {
        if before.is_some() { return Err("新建记录的身份已存在".into()); }
        if let Some(old) = &current_binding {
            if job(conn, &old.job_id).await?.is_some() { return Err("来源已经关联其他记录，请重新核对".into()); }
        }
    } else if before.is_none() { return Err("需要更新或关联的记录已经删除".into()); }
    let timestamp = now();
    let after = if row.action == "link" { before.clone().ok_or("关联记录不存在")? } else {
        JobSnapshot { id: row.job_id.clone(), values: row.values.clone(), revision: before.as_ref().map_or(0, |j| j.revision + 1),
            updated_at: timestamp, created_at: before.as_ref().map_or(timestamp, |j| j.created_at) }
    };
    if row.action != "link" { write_job(conn, &after, row.action == "create").await?; }
    let binding_after = Binding { source_id: source.into(), identity_key: identity.clone(), job_id: after.id.clone(),
        source_fingerprint: row.source_fingerprint.clone(), last_source: row.source_values.clone(), last_written: after.values.clone(),
        target_revision: after.revision, last_batch_id: batch.into(), revision: current_binding.as_ref().map_or(1, |b| b.revision + 1) };
    write_binding(conn, &binding_after).await?;
    Ok(RowResult { action: row.action.clone(), job_id: after.id.clone(), before, after, binding_before: current_binding, binding_after, undone: false })
}

fn skipped(result: &mut ImportResult, row: &FrozenRow) {
    match row.disposition.as_str() {
        "duplicate" => result.duplicates += 1,
        "listing" => result.unselected_listings += 1,
        "review" => result.needs_review += 1,
        "invalid" => result.invalid += 1,
        _ => result.unselected += 1,
    }
}

pub async fn commit(pool: &SqlitePool, batch: &str, hash: &str, revision: i64, selected: Vec<String>, fail_after: Option<usize>) -> Result<ImportResult, String> {
    let mut connection = connection(pool).await?;
    let mut tx = connection.begin_with("BEGIN IMMEDIATE").await.map_err(db_error)?;
    let stored = sqlx::query("SELECT * FROM job_import_batches WHERE id=?").bind(batch).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or("导入批次不存在")?;
    let state: String = stored.get("state");
    if state == "committed" { return parse(stored.get::<&str,_>("result_json")); }
    if state != "ready" || stored.get::<&str,_>("preview_hash") != hash || stored.get::<i64,_>("revision") != revision { return Err("预览已经过期或已撤销，请重新读取".into()); }
    let snapshot: Option<String> = stored.get("status_snapshot");
    if status_snapshot(&mut tx).await? != snapshot { return Err("投递状态已改变，请重新生成预览".into()); }
    let statuses = status_ids(&snapshot)?;
    let source: String = stored.get("source_id");
    let rows = sqlx::query("SELECT row_key,plan_json FROM job_import_rows WHERE batch_id=? ORDER BY ordinal").bind(batch).fetch_all(&mut *tx).await.map_err(db_error)?;
    let requested: HashSet<String> = selected.iter().cloned().collect();
    if requested.len() != selected.len() || requested.is_empty() || !requested.iter().all(|key| rows.iter().any(|r| r.get::<&str,_>("row_key") == key)) { return Err("选中记录不属于当前预览或为空".into()); }
    let mut result = ImportResult::default();
    let mut identities = HashSet::new();
    let mut targets = HashSet::new();
    for record in rows {
        let row: FrozenRow = parse(record.get::<&str,_>("plan_json"))?;
        if !requested.contains(&row.key) { skipped(&mut result, &row); continue; }
        if !["create", "update", "link"].contains(&row.action.as_str()) || !["application", "preparing"].contains(&row.kind.as_str()) { return Err("不能提交未核对或跳过的行".into()); }
        if !identities.insert(row.identity_key.clone()) || !targets.insert(row.job_id.clone()) { return Err("本批次选中了重复身份或同一目标记录，请核对".into()); }
        validate_values(&row.values, &statuses)?;
        let audit = apply_row(&mut tx, batch, &source, &row).await?;
        sqlx::query("UPDATE job_import_rows SET result_json=? WHERE batch_id=? AND row_key=?").bind(json(&audit)?).bind(batch).bind(&row.key).execute(&mut *tx).await.map_err(db_error)?;
        match row.action.as_str() {
            "create" if row.values.status == "preparing" => result.created_preparing += 1,
            "create" => result.created_applications += 1,
            "update" => result.updated += 1,
            "link" => result.linked += 1,
            _ => unreachable!(),
        }
        result.jobs.push(audit.job_id);
        if fail_after == Some(result.jobs.len()) { return Err("测试注入：事务中断".into()); }
    }
    sqlx::query("UPDATE job_import_batches SET state='committed',result_json=?,committed_at=? WHERE id=?").bind(json(&result)?).bind(now()).bind(batch).execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}
