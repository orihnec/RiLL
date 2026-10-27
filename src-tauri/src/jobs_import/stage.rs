use super::{db::*, model::*};
use sha2::{Digest, Sha256};
use sqlx::{Connection, SqlitePool};
use std::collections::HashSet;

pub fn validate_values(values: &JobValues, statuses: &[String]) -> Result<(), String> {
    if values.company.trim().is_empty() || values.position.trim().is_empty() || values.company.len() > 10_000 || values.position.len() > 20_000 {
        return Err("公司和完整岗位必须填写，且长度不能超出限制".into());
    }
    if !statuses.contains(&values.status) { return Err("投递状态已经变化，请重新生成预览".into()); }
    if let Some(value) = &values.url {
        let url = url::Url::parse(value).map_err(|_| "投递链接无效")?;
        if !["https", "http"].contains(&url.scheme()) || !url.username().is_empty() || url.password().is_some() { return Err("投递链接必须为 HTTP 或 HTTPS 地址".into()); }
    }
    if values.applied_at.is_some_and(|date| !( -2_208_988_800_000..=7_258_032_000_000).contains(&date)) { return Err("投递日期超出支持范围".into()); }
    if values.status == "preparing" && values.applied_at.is_some() { return Err("准备投递不应带有真实投递日期".into()); }
    Ok(())
}

pub async fn stage(pool: &SqlitePool, input: StagePayload) -> Result<Batch, String> {
    let serialized = json(&input)?;
    if input.id.is_empty() || input.id.len() > 100 || input.source_id.len() != 64 || input.rows.len() > 10_000 || serialized.len() > 40 * 1024 * 1024 {
        return Err("导入批次超出大小限制".into());
    }
    let hash = format!("{:x}", Sha256::digest(serialized.as_bytes()));
    let mut connection = connection(pool).await?;
    let mut tx = connection.begin_with("BEGIN IMMEDIATE").await.map_err(db_error)?;
    if status_snapshot(&mut tx).await? != input.status_snapshot { return Err("投递状态已改变，请重新生成预览".into()); }
    let statuses = status_ids(&input.status_snapshot)?;
    let mut keys = HashSet::new();
    for row in &input.rows {
        if row.key.is_empty() || row.key.len() > 256 || !keys.insert(&row.key) || row.identity_key.as_ref().is_some_and(|key| key.len() > 2048) {
            return Err("来源行标识无效或重复".into());
        }
        if !["create", "update", "link", "skip"].contains(&row.action.as_str()) { return Err("不支持的导入操作".into()); }
        if row.action != "skip" {
            if !["application", "preparing"].contains(&row.kind.as_str()) || row.identity_key.is_none() { return Err("存在尚未核对的记录".into()); }
            validate_values(&row.values, &statuses)?;
        }
    }
    let created = now();
    sqlx::query("INSERT INTO job_import_sources (id,descriptor_json,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET descriptor_json=excluded.descriptor_json,updated_at=excluded.updated_at")
        .bind(&input.source_id).bind(json(&input.source)?).bind(created).bind(created).execute(&mut *tx).await.map_err(db_error)?;
    sqlx::query("INSERT INTO job_import_mappings (source_id,schema_fingerprint,parser_version,status_fingerprint,mapping_json,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(source_id,schema_fingerprint,parser_version,status_fingerprint) DO UPDATE SET mapping_json=excluded.mapping_json,updated_at=excluded.updated_at")
        .bind(&input.source_id).bind(&input.schema_fingerprint).bind(&input.parser_version).bind(&input.status_fingerprint).bind(json(&input.mapping)?).bind(created).execute(&mut *tx).await.map_err(db_error)?;
    sqlx::query("INSERT INTO job_import_batches (id,source_id,state,preview_hash,status_snapshot,schema_fingerprint,mapping_json,created_at) VALUES (?,?,'ready',?,?,?,?,?)")
        .bind(&input.id).bind(&input.source_id).bind(&hash).bind(&input.status_snapshot).bind(&input.schema_fingerprint).bind(json(&input.mapping)?).bind(created).execute(&mut *tx).await.map_err(db_error)?;
    for (ordinal, row) in input.rows.iter().enumerate() {
        sqlx::query("INSERT INTO job_import_rows (batch_id,row_key,ordinal,plan_json) VALUES (?,?,?,?)").bind(&input.id).bind(&row.key).bind(ordinal as i64).bind(json(row)?)
            .execute(&mut *tx).await.map_err(db_error)?;
    }
    tx.commit().await.map_err(db_error)?;
    Ok(Batch { id: input.id, source_id: input.source_id, hash, revision: 1, state: "ready".into(), created_at: created, result: None })
}
