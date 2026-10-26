use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobValues {
    pub company: String, pub position: String, pub status: String,
    pub url: Option<String>, pub notes: Option<String>, pub applied_at: Option<i64>, pub extras: Option<Value>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobSnapshot {
    pub id: String, pub values: JobValues, pub revision: i64, pub updated_at: i64, pub created_at: i64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Binding {
    pub source_id: String, pub identity_key: String, pub job_id: String, pub source_fingerprint: String,
    pub last_source: JobValues, pub last_written: JobValues, pub target_revision: i64,
    pub last_batch_id: String, pub revision: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FrozenRow {
    pub key: String, pub identity_key: Option<String>, pub source_fingerprint: String, pub kind: String,
    pub action: String, pub job_id: String, pub values: JobValues, pub source_values: JobValues,
    pub expected: Option<JobSnapshot>, pub binding: Option<Binding>, pub normalized: Value,
    pub disposition: String,
    pub selected: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StagePayload {
    pub id: String, pub source_id: String, pub source: Value, pub schema_fingerprint: String,
    pub status_snapshot: Option<String>, pub status_fingerprint: String, pub parser_version: String,
    pub mapping: Value, pub rows: Vec<FrozenRow>,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Batch {
    pub id: String, pub source_id: String, pub hash: String, pub revision: i64,
    pub state: String, pub created_at: i64, pub result: Option<ImportResult>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub created_applications: usize, pub created_preparing: usize, pub updated: usize, pub linked: usize,
    pub duplicates: usize, pub unselected_listings: usize, pub needs_review: usize, pub invalid: usize,
    pub unselected: usize, pub failed: usize, pub jobs: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowResult {
    pub action: String, pub job_id: String, pub before: Option<JobSnapshot>, pub after: JobSnapshot,
    pub binding_before: Option<Binding>, pub binding_after: Binding, pub undone: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoRow { pub key: String, pub job_id: String, pub action: String, pub eligible: bool, pub reason: String }
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoPreview { pub eligible: usize, pub protected: usize, pub rows: Vec<UndoRow> }
