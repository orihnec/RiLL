use super::{commit::commit, db::*, model::*, stage::stage, undo::undo};
use sqlx::{Executor, Row, SqlitePool};

async fn database() -> SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    pool.execute(include_str!("../../../src/modules/jobs/schema.sql")).await.unwrap();
    pool.execute("CREATE TABLE app_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)").await.unwrap();
    for sql in [include_str!("../../../src/modules/jobs/schema-v2.sql"), include_str!("../../../src/modules/jobs/schema-v3.sql"), include_str!("../../../src/modules/jobs/schema-v4.sql"), include_str!("../../../src/modules/jobs/schema-v5.sql")] {
        sqlx::raw_sql(sql).execute(&pool).await.unwrap();
    }
    pool
}
fn values(company: &str) -> JobValues {
    JobValues { company: company.into(), position: "完整岗位名称 / 研发".into(), status: "applied".into(), url: Some("https://example.test/apply".into()), notes: None, applied_at: None, extras: Some(serde_json::json!({"原文":"测试"})) }
}
fn payload(id: &str, n: usize) -> StagePayload {
    StagePayload { id: id.into(), source_id: "a".repeat(64), source: serde_json::json!({"title":"测试来源"}),
        schema_fingerprint: "schema".into(), status_snapshot: None, status_fingerprint: "status".into(), parser_version: "1".into(), mapping: serde_json::json!({}),
        rows: (0..n).map(|i| FrozenRow { key: format!("r{i}"), identity_key: Some(format!("id:r{i}")), source_fingerprint: format!("hash{i}"), kind: "application".into(),
            action: "create".into(), job_id: format!("job{i}"), values: values(&format!("公司{i}")), source_values: values(&format!("公司{i}")), expected: None, binding: None,
            normalized: serde_json::json!({}), disposition: "unselected".into(), selected: true }).collect() }
}
async fn count(pool: &SqlitePool, table: &str) -> i64 {
    sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}")).fetch_one(pool).await.unwrap()
}
#[test]
fn atomic_failure_retry_and_double_commit() { tauri::async_runtime::block_on(async {
    let pool = database().await;
    let b = stage(&pool, payload("b1", 3)).await.unwrap();
    let selected = vec!["r0".into(), "r1".into(), "r2".into()];
    assert!(commit(&pool, &b.id, &b.hash, 1, selected.clone(), Some(2)).await.is_err());
    assert_eq!(count(&pool, "job_applications").await, 0);
    assert_eq!(count(&pool, "job_import_bindings").await, 0);
    let first = commit(&pool, &b.id, &b.hash, 1, selected.clone(), None).await.unwrap();
    let second = commit(&pool, &b.id, &b.hash, 1, selected, None).await.unwrap();
    assert_eq!(first.jobs, second.jobs); assert_eq!(first.created_applications, 3);
    assert_eq!(count(&pool, "job_applications").await, 3);
    assert_eq!(count(&pool, "job_import_bindings").await, 3);
    let row = sqlx::query("SELECT applied_at,applied_at_known FROM job_applications LIMIT 1").fetch_one(&pool).await.unwrap();
    assert_eq!(row.get::<i64,_>("applied_at"), 0); assert_eq!(row.get::<i64,_>("applied_at_known"), 0);
}); }
#[test]
fn stale_status_and_concurrent_edit_reject_all() { tauri::async_runtime::block_on(async {
    let pool = database().await;
    let b = stage(&pool, payload("b1", 1)).await.unwrap();
    pool.execute("INSERT INTO app_settings VALUES ('job_statuses','[]')").await.unwrap();
    assert!(commit(&pool, &b.id, &b.hash, 1, vec!["r0".into()], None).await.is_err());
    assert_eq!(count(&pool,"job_applications").await,0);
    pool.execute("DELETE FROM app_settings").await.unwrap();
    commit(&pool, &b.id, &b.hash, 1, vec!["r0".into()], None).await.unwrap();
    let mut conn = pool.acquire().await.unwrap();
    let current = job(&mut conn,"job0").await.unwrap().unwrap();
    let bind = binding(&mut conn,&"a".repeat(64),"id:r0").await.unwrap();
    drop(conn);
    let mut next = payload("b2",1);
    next.rows[0].action="update".into(); next.rows[0].expected=Some(current); next.rows[0].binding=bind;
    next.rows[0].values.notes=Some("源更新".into());
    let b2=stage(&pool,next).await.unwrap();
    // 模拟旧窗口没有 revision 支持的写入，同样必须检出完整快照变化。
    pool.execute("UPDATE job_applications SET notes='人工编辑'").await.unwrap();
    assert!(commit(&pool,&b2.id,&b2.hash,1,vec!["r0".into()],None).await.is_err());
}); }
#[test]
fn undo_protects_edits_and_prevents_old_commit_replay() { tauri::async_runtime::block_on(async {
    let pool=database().await; let b=stage(&pool,payload("b1",2)).await.unwrap();
    commit(&pool,&b.id,&b.hash,1,vec!["r0".into(),"r1".into()],None).await.unwrap();
    pool.execute("UPDATE job_applications SET revision=revision+1,notes='保留' WHERE id='job1'").await.unwrap();
    let preview=undo(&pool,&b.id,false).await.unwrap(); assert_eq!(preview.eligible,1); assert_eq!(preview.protected,1);
    let done=undo(&pool,&b.id,true).await.unwrap(); assert_eq!(done.eligible,1);
    assert_eq!(count(&pool,"job_applications").await,1);
    assert!(commit(&pool,&b.id,&b.hash,1,vec!["r0".into()],None).await.is_err());
}); }
#[test]
fn migration_replay_preserves_old_dates_and_interrupted_alters() { tauri::async_runtime::block_on(async {
    let pool=sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::raw_sql(include_str!("../../../src/modules/jobs/schema.sql")).execute(&pool).await.unwrap();
    pool.execute("INSERT INTO job_applications VALUES ('old','旧公司','原岗位','applied',NULL,NULL,1234,1234,1234)").await.unwrap();
    let migrations=[("applied_at_known",include_str!("../../../src/modules/jobs/schema-v2.sql")),("revision",include_str!("../../../src/modules/jobs/schema-v3.sql")),("extras_json",include_str!("../../../src/modules/jobs/schema-v4.sql"))];
    // 第一次只 ALTER 一列后中断，第二次按照 skipIf 逻辑恢复，再完整重放。
    pool.execute(migrations[0].1).await.unwrap();
    for _ in 0..2 { for (name,sql) in migrations {
        let names=sqlx::query("PRAGMA table_info(job_applications)").fetch_all(&pool).await.unwrap();
        if !names.iter().any(|r|r.get::<&str,_>("name")==name) { pool.execute(sql).await.unwrap(); }
    } }
    let r=sqlx::query("SELECT applied_at,applied_at_known,revision FROM job_applications").fetch_one(&pool).await.unwrap();
    assert_eq!(r.get::<i64,_>("applied_at"),1234); assert_eq!(r.get::<i64,_>("applied_at_known"),1); assert_eq!(r.get::<i64,_>("revision"),0);
}); }

#[test]
fn sql_failure_and_concurrent_confirm_are_atomic() { tauri::async_runtime::block_on(async {
    let pool=database().await;
    let b=stage(&pool,payload("failure",3)).await.unwrap();
    pool.execute("CREATE TRIGGER fail_row BEFORE INSERT ON job_applications WHEN NEW.id='job1' BEGIN SELECT RAISE(ABORT,'injected'); END").await.unwrap();
    assert!(commit(&pool,&b.id,&b.hash,1,vec!["r0".into(),"r1".into(),"r2".into()],None).await.is_err());
    assert_eq!(count(&pool,"job_applications").await,0); assert_eq!(count(&pool,"job_import_bindings").await,0);
    pool.execute("DROP TRIGGER fail_row").await.unwrap();
    let first_pool=pool.clone(); let id=b.id.clone(); let hash=b.hash.clone();
    let first=tauri::async_runtime::spawn(async move { commit(&first_pool,&id,&hash,1,vec!["r0".into(),"r1".into()],None).await });
    let second=commit(&pool,&b.id,&b.hash,1,vec!["r0".into(),"r1".into()],None).await.unwrap();
    assert_eq!(first.await.unwrap().unwrap().jobs,second.jobs); assert_eq!(count(&pool,"job_applications").await,2);
}); }
#[test]
fn update_undo_restores_values_with_monotonic_revision() { tauri::async_runtime::block_on(async {
    let pool=database().await; let b=stage(&pool,payload("first",1)).await.unwrap();
    commit(&pool,&b.id,&b.hash,1,vec!["r0".into()],None).await.unwrap();
    let mut conn=pool.acquire().await.unwrap();
    let original=job(&mut conn,"job0").await.unwrap().unwrap();
    let binding_before=binding(&mut conn,&"a".repeat(64),"id:r0").await.unwrap(); drop(conn);
    let mut input=payload("change",1); input.rows[0].action="update".into(); input.rows[0].expected=Some(original.clone()); input.rows[0].binding=binding_before;
    input.rows[0].values.notes=Some("同步备注".into()); input.rows[0].source_values.notes=Some("同步备注".into());
    let changed=stage(&pool,input).await.unwrap(); commit(&pool,&changed.id,&changed.hash,1,vec!["r0".into()],None).await.unwrap();
    assert_eq!(undo(&pool,&b.id,false).await.unwrap().protected,1);
    assert_eq!(undo(&pool,&changed.id,true).await.unwrap().eligible,1);
    let mut conn=pool.acquire().await.unwrap(); let restored=job(&mut conn,"job0").await.unwrap().unwrap();
    assert_eq!(restored.values,original.values); assert_eq!(restored.revision,2);
}); }
#[test]
fn later_source_link_protects_original_batch_undo() { tauri::async_runtime::block_on(async {
    let pool=database().await; let b=stage(&pool,payload("first",1)).await.unwrap();
    commit(&pool,&b.id,&b.hash,1,vec!["r0".into()],None).await.unwrap();
    let mut conn=pool.acquire().await.unwrap(); let current=job(&mut conn,"job0").await.unwrap().unwrap(); drop(conn);
    let mut input=payload("another-source",1); input.source_id="b".repeat(64); input.rows[0].action="link".into(); input.rows[0].expected=Some(current.clone()); input.rows[0].values=current.values;
    let linked=stage(&pool,input).await.unwrap(); commit(&pool,&linked.id,&linked.hash,1,vec!["r0".into()],None).await.unwrap();
    assert_eq!(undo(&pool,&b.id,false).await.unwrap().eligible,0);
    assert_eq!(undo(&pool,&linked.id,true).await.unwrap().eligible,1);
    assert_eq!(count(&pool,"job_applications").await,1);
}); }

#[test]
fn clearing_snapshots_preserves_jobs_and_disables_undo() { tauri::async_runtime::block_on(async {
    let pool=database().await; let b=stage(&pool,payload("clear",1)).await.unwrap();
    commit(&pool,&b.id,&b.hash,1,vec!["r0".into()],None).await.unwrap();
    super::cleanup::cleanup(&pool,&b.id).await.unwrap();
    assert_eq!(count(&pool,"job_import_rows").await,0); assert_eq!(count(&pool,"job_import_bindings").await,1);
    assert_eq!(count(&pool,"job_applications").await,1);
    assert!(undo(&pool,&b.id,true).await.is_err());
    assert!(commit(&pool,&b.id,&b.hash,1,vec!["r0".into()],None).await.is_err());
}); }
