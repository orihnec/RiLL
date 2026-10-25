use crate::error::{AppError, AppResult};

/// PDF 抽文本。扫描件（没有文本层）会拿到空串 —— 这种情况必须明确告诉用户，
/// 否则模型会以为"这份简历是空白的"。
pub fn extract(path: &str) -> AppResult<String> {
    let bytes = std::fs::read(path)?;
    let text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| AppError::parse(format!("PDF 解析失败：{e}")))?;
    let text = text.trim();
    if text.is_empty() {
        return Err(AppError::parse(
            "这份 PDF 没有文本层（扫描件/图片版），暂时读不出文字",
        ));
    }
    Ok(text.to_string())
}
