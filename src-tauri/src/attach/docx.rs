use crate::error::{AppError, AppResult};
use crate::mail::html::html_to_text;

/// docx = zip 里的 `word/document.xml`。抽 `<w:t>` 文本 + 段落换行即可，
/// 不需要完整 OOXML 支持（简历/论文/通知这类文档够用）。
pub fn extract(path: &str) -> AppResult<String> {
    let file = std::fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| AppError::parse(format!("docx 已损坏：{e}")))?;
    let mut xml = String::new();
    {
        let mut doc = zip
            .by_name("word/document.xml")
            .map_err(|_| AppError::parse("docx 里找不到 word/document.xml（可能不是 Word 文档）"))?;
        std::io::Read::read_to_string(&mut doc, &mut xml)?;
    }

    // `<w:p>` = 段落，先换成换行再剥标签，保留段落结构
    let with_breaks = xml
        .replace("</w:p>", "\n")
        .replace("<w:br/>", "\n")
        .replace("<w:tab/>", " ");
    let text = html_to_text(&with_breaks);
    if text.trim().is_empty() {
        return Err(AppError::parse("这个 docx 没有可读文字（可能是纯图片）"));
    }
    Ok(text)
}
