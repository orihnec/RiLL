//! 乱码判定：中文邮件解码后的"干净程度"打分。
//!
//! 只认三种字符：替换字符（必然乱码）、CJK（中文正常）、"中文邮件不会出现"的区段
//! （西里尔 / 国际音标扩展 / 亚美尼亚）。真·俄语邮件会被误判成 GBK —— 求职场景可接受。
/**
 * 判断一段解码结果"像不像乱码"。
 *
 * 依据（真实案例）：「校」的 GBK 是 `D0 A3`，正好是合法 UTF-8 的 `У`(U+0423)；
 * 「感谢应聘」→ `��лӦƸ`。所以 GBK 被当 UTF-8 解时，
 * 结果要么出现替换字符 `�`，要么满是**西里尔字母/国际音标扩展**（中文邮件里根本不会出现），
 * 而**几乎没有汉字**。反过来，真正的中文（"中文测试"）和西欧文本（"été"）都不满足这些特征。
 *
 * 已知取舍：真·俄语邮件会被误判成 GBK。对"中国求职者邮箱"这个场景可以接受。
 */
pub(crate) fn looks_like_mojibake(s: &str) -> bool {
    let mut replacement = 0;
    let mut exotic = 0; // 西里尔 / 国际音标扩展 / 亚美尼亚等"中文邮件不会出现"的区段
    let mut cjk = 0;
    for c in s.chars() {
        match c {
            '\u{FFFD}' => replacement += 1,
            '\u{4E00}'..='\u{9FFF}' | '\u{3400}'..='\u{4DBF}' => cjk += 1,
            '\u{0250}'..='\u{02FF}' | '\u{0400}'..='\u{04FF}' | '\u{0530}'..='\u{058F}' => exotic += 1,
            _ => {}
        }
    }
    if replacement > 0 {
        return true;
    }
    exotic > 0 && cjk == 0
}

/// 解码脏字节序列时的"谁更干净"指标：替换字符与控制字符越少越好。
pub(crate) fn badness(s: &str) -> usize {
    s.chars()
        .filter(|c| *c == '\u{FFFD}' || (c.is_control() && !matches!(c, '\n' | '\r' | '\t')))
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replacement_char_means_mojibake() {
        assert!(looks_like_mojibake("Ученые мир"));
        assert!(looks_like_mojibake("\u{FFFD}\u{FFFD}"));
    }

    #[test]
    fn cyrillic_without_cjk_is_mojibake() {
        assert!(looks_like_mojibake("Привет мир"));
    }

    #[test]
    fn proper_chinese_and_latin_are_clean() {
        assert!(!looks_like_mojibake("中文测试"));
        assert!(!looks_like_mojibake("café été"));
    }

    #[test]
    fn badness_ignores_legit_whitespace() {
        assert_eq!(badness("a\nb\tc"), 0);
        assert_eq!(badness("a\u{FFFD}b"), 1);
        assert_eq!(badness("\u{1}\u{2}"), 2);
    }
}