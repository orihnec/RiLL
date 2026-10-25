//! 附件与文本抽取（聊天发文件、知识库导入 PDF/Word）。
//!
//! 只做一件事：**给一个路径，尽可能抽成纯文本**。不认识/抽不出就明确报错，
//! 不静默返回空字符串（那会让模型以为文件是空的）。

use serde::Serialize;

use crate::error::{AppError, AppResult};

mod docx;
mod kind;
mod pdf;
mod text;

/// 抽取结果（前端直接展示字数/截断状态）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachText {
    /// 文件类型：text / pdf / docx
    pub kind: String,
    /// 纯文本（可能被截断）
    pub text: String,
    /// 字符数（截断后的实际长度）
    pub chars: usize,
    /// 是否因为超长被截断
    pub truncated: bool,
}

/// 单文件上限 10 MB：再大就不该塞进上下文
const MAX_BYTES: u64 = 10 * 1024 * 1024;
/// 默认最多取 20 万字符（约 10 万汉字）
const DEFAULT_MAX_CHARS: usize = 200_000;

#[tauri::command]
pub async fn attach_extract(path: String, max_chars: Option<usize>) -> AppResult<AttachText> {
    let meta = std::fs::metadata(&path)?;
    if meta.len() > MAX_BYTES {
        return Err(AppError::unsupported(format!(
            "文件太大（{} MB），上限 10 MB",
            meta.len() / 1024 / 1024
        )));
    }

    let name = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let kind = kind::of(&name)?;

    let text = match kind {
        "text" => text::extract(&path)?,
        "pdf" => pdf::extract(&path)?,
        "docx" => docx::extract(&path)?,
        other => return Err(AppError::unsupported(format!("暂不支持 {other} 类型"))),
    };

    let limit = max_chars.unwrap_or(DEFAULT_MAX_CHARS);
    let chars: Vec<char> = text.chars().collect();
    let truncated = chars.len() > limit;
    let text: String = if truncated {
        chars[..limit].iter().collect()
    } else {
        text
    };

    Ok(AttachText {
        kind: kind.to_string(),
        chars: text.chars().count(),
        text,
        truncated,
    })
}
