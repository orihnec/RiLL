use crate::error::{AppError, AppResult};

/// 按扩展名判定类型。**白名单**：不认识的一律报错，避免把二进制当文本喂给模型。
pub fn of(name: &str) -> AppResult<&'static str> {
    let ext = std::path::Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "txt" | "md" | "markdown" | "csv" | "tsv" | "json" | "log" | "yaml" | "yml" | "toml" | "xml"
        | "html" | "htm" => Ok("text"),
        "pdf" => Ok("pdf"),
        "docx" => Ok("docx"),
        // 明确回报不支持的常见类型（比"静默当空文件"好）
        "doc" | "xls" | "xlsx" | "ppt" | "pptx" | "png" | "jpg" | "jpeg" | "gif" | "zip" | "rar"
        | "7z" | "exe" | "dmg" | "apk" => Err(AppError::unsupported(format!(
            "暂不支持 .{ext}（目前支持 txt/md/csv/json/pdf/docx）"
        ))),
        "" => Err(AppError::unsupported("这个文件没有扩展名，无法判断类型")),
        other => Err(AppError::unsupported(format!(
            "暂不支持 .{other}（目前支持 txt/md/csv/json/pdf/docx）"
        ))),
    }
}
