use crate::error::{AppError, AppResult};

/// 纯文本类：UTF-8 优先，失败按 GB18030 兜底（国内 txt/csv 大量是 GBK）。
pub fn extract(path: &str) -> AppResult<String> {
    let bytes = std::fs::read(path)?;
    if let Ok(s) = std::str::from_utf8(&bytes) {
        return Ok(s.to_string());
    }
    let (text, _, had_errors) = encoding_rs::GB18030.decode(&bytes);
    if had_errors {
        return Err(AppError::parse("无法识别文件编码（既不是 UTF-8 也不是 GBK）"));
    }
    Ok(text.into_owned())
}
