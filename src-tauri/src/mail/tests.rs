//! mail 单元测试（mod tests 的实体，挪出来是为了让 mod.rs 只剩命令）。

    use super::*;
    use crate::mail::encoding::*;
    use crate::mail::html::*;
    use crate::mail::mime::*;
    use base64::Engine;
    use mail_parser::MessageParser;
    use std::time::Duration;

    /* ---------- 实时接收的真机端到端验证用的小工具 ---------- */

    /// 测试专用：极简 SMTP（163 的 smtp.163.com:465 隐式 TLS + AUTH LOGIN）。
    /// 只为验证"实时接收"能多快发现新邮件；顺便把 SMTP 通道跑通（以后写邮件功能要用）。
    fn smtp_send(host: &str, user: &str, pass: &str, to: &str, subject: &str, body: &str) -> Result<(), String> {
        use base64::Engine as _;
        use native_tls::TlsConnector;
        use std::io::{BufRead, BufReader, Write};
        use std::net::TcpStream;

        type Stream = native_tls::TlsStream<TcpStream>;
        fn read_reply(r: &mut BufReader<Stream>) -> Result<String, String> {
            let mut out = String::new();
            loop {
                let mut line = String::new();
                let n = r.read_line(&mut line).map_err(|e| e.to_string())?;
                if n == 0 {
                    return Err("SMTP 连接被关闭".into());
                }
                out.push_str(&line);
                // 多行应答："250-..." 继续，"250 ..." 结束
                if line.len() < 4 || &line[3..4] != "-" {
                    return Ok(out);
                }
            }
        }
        fn cmd(r: &mut BufReader<Stream>, text: &str, want: &str) -> Result<String, String> {
            {
                let w = r.get_mut();
                w.write_all(format!("{text}\r\n").as_bytes())
                    .and_then(|_| w.flush())
                    .map_err(|e| e.to_string())?;
            }
            let reply = read_reply(r)?;
            if !reply.starts_with(want) {
                return Err(format!("期望 {want}，实际：{}", reply.trim()));
            }
            Ok(reply)
        }

        let tcp = TcpStream::connect((host, 465)).map_err(|e| format!("连接 {host} 失败：{e}"))?;
        let _ = tcp.set_read_timeout(Some(Duration::from_secs(30)));
        let tls = TlsConnector::builder()
            .build()
            .map_err(|e| e.to_string())?
            .connect(host, tcp)
            .map_err(|e| format!("TLS 失败：{e}"))?;
        // native-tls 的 TlsStream 不能 try_clone，SMTP 是请求-应答，单连接读写即可
        let mut r = BufReader::new(tls);

        read_reply(&mut r)?;
        cmd(&mut r, &format!("EHLO {host}"), "250")?;
        cmd(&mut r, "AUTH LOGIN", "334")?;
        cmd(&mut r, &base64::engine::general_purpose::STANDARD.encode(user), "334")?;
        cmd(&mut r, &base64::engine::general_purpose::STANDARD.encode(pass), "235")?;
        cmd(&mut r, &format!("MAIL FROM:<{user}>"), "250")?;
        cmd(&mut r, &format!("RCPT TO:<{to}>"), "250")?;
        cmd(&mut r, "DATA", "354")?;

        let body_b64 = base64::engine::general_purpose::STANDARD.encode(body.as_bytes());
        let subj_b64 = base64::engine::general_purpose::STANDARD.encode(subject.as_bytes());
        let mail = format!(
            "From: {user}\r\nTo: {to}\r\nSubject: =?UTF-8?B?{subj_b64}?=\r\n\
             MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\
             Content-Transfer-Encoding: base64\r\n\r\n{body_b64}\r\n.\r\n"
        );
        {
            let w = r.get_mut();
            w.write_all(mail.as_bytes())
                .and_then(|_| w.flush())
                .map_err(|e| e.to_string())?;
        }
        let reply = read_reply(&mut r)?;
        if !reply.starts_with("250") {
            return Err(format!("投递失败：{}", reply.trim()));
        }
        let _ = cmd(&mut r, "QUIT", "221");
        Ok(())
    }

    /// **实时接收的真机验证**：起监听 → 用 SMTP 给自己发一封信 → 看多久发现。
    ///
    /// ```text
    /// $env:MAIL_TEST_USER="you@163.com"; $env:MAIL_TEST_PASS="授权码"; $env:MAIL_TEST_SMTP="1"
    /// cargo test --lib live_realtime -- --nocapture
    /// ```
    /// 不设 MAIL_TEST_SMTP 时只验证"能进入监听状态"，不发信。
    #[test]
    fn live_realtime_detects_new_mail() {
        use std::sync::atomic::Ordering;
        use std::sync::{Arc, Mutex};

        let user = std::env::var("MAIL_TEST_USER").unwrap_or_default();
        let pass = std::env::var("MAIL_TEST_PASS").unwrap_or_default();
        if user.is_empty() || pass.is_empty() {
            eprintln!("跳过 live_realtime_detects_new_mail：未设置 MAIL_TEST_USER / MAIL_TEST_PASS");
            return;
        }
        let do_send = std::env::var("MAIL_TEST_SMTP").map(|v| v == "1").unwrap_or(false);

        let events: Arc<Mutex<Vec<WatchEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let sink: WatchSink = {
            let ev = events.clone();
            Arc::new(move |e: WatchEvent| {
                println!(
                    "[事件] kind={} mode={} messages={} unseen={} prev={} {}",
                    e.kind, e.mode, e.messages, e.unseen, e.previous, e.message
                );
                ev.lock().unwrap().push(e);
            })
        };
        let stop: StopFlag = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let spec = WatchSpec {
            account_id: "live-test".into(),
            host: std::env::var("MAIL_TEST_HOST").unwrap_or_else(|_| "imap.163.com".into()),
            port: 993,
            security: "ssl".into(),
            username: user.clone(),
            password: pass.clone(),
            folder: "INBOX".into(),
            interval_sec: 5, // 测快一点
        };
        let stop_for_thread = stop.clone();
        let handle = std::thread::spawn(move || watch_loop(spec, sink, stop_for_thread));

        // 1) 等 ready
        let t0 = std::time::Instant::now();
        while events.lock().unwrap().is_empty() && t0.elapsed() < Duration::from_secs(25) {
            std::thread::sleep(Duration::from_millis(200));
        }
        let first = events.lock().unwrap().first().cloned();
        let Some(first) = first else {
            stop.store(true, Ordering::Relaxed);
            let _ = handle.join();
            panic!("25 秒内没有收到 ready 事件（监听没起来）");
        };
        assert_eq!(first.kind, "ready");
        println!("\n监听就绪：mode={} 收件箱 {} 封", first.mode, first.messages);
        let before = first.messages;

        if !do_send {
            stop.store(true, Ordering::Relaxed);
            let _ = handle.join();
            println!("（未设置 MAIL_TEST_SMTP=1，跳过发信）\n");
            return;
        }

        // 2) 真发一封信给自己
        let subject = format!("【测试】实时接收验证 {}", first.unseen);
        let sent_at = std::time::Instant::now();
        smtp_send(
            "smtp.163.com",
            &user,
            &pass,
            &user,
            &subject,
            "这是验证 RiliAgent 实时接收的测试邮件，可以直接删除。",
        )
        .expect("SMTP 发信失败");
        println!("已投递测试邮件：「{subject}」");

        // 3) 等 changed（最多 40 秒）
        let mut detected = None;
        while sent_at.elapsed() < Duration::from_secs(40) {
            if let Some(e) = events
                .lock()
                .unwrap()
                .iter()
                .find(|e| e.kind == "changed" && e.messages > before)
                .cloned()
            {
                detected = Some(e);
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        stop.store(true, Ordering::Relaxed);
        let _ = handle.join();

        let Some(ev) = detected else {
            panic!("40 秒内没检测到新邮件（实时接收不工作）");
        };
        let delay = sent_at.elapsed();
        println!(
            "✅ 检测到新邮件：{} → {} 封，从投递到发现耗时 {:?}",
            ev.previous, ev.messages, delay
        );
        assert!(ev.messages > ev.previous);
        assert!(
            delay < Duration::from_secs(35),
            "发现太慢：{delay:?}（期望个位数秒级）"
        );
        println!();
    }

    #[test]
    fn mutf7_decodes_chinese_folder_names() {
        // &XfJT0ZAB- = 已发送（163/QQ 实际编码；base64 → 0x5DF2 0x53D1 0x9001）
        assert_eq!(decode_mutf7("&XfJT0ZAB-"), "已发送");
        assert_eq!(decode_mutf7("&XfI-"), "已");
        assert_eq!(decode_mutf7("&U9E-"), "发");
        assert_eq!(decode_mutf7("&XfJSIJZk-"), "已删除");
        assert_eq!(decode_mutf7("INBOX"), "INBOX");
        assert_eq!(decode_mutf7("A&-B"), "A&B");
        assert_eq!(decode_mutf7("&"), "&");
        assert!(!decode_mutf7("&!!!-").is_empty());
    }

    #[test]
    fn imap_date_uses_english_month() {
        let d = imap_date(0);
        assert_eq!(d.len(), 11, "{d}");
        assert!(d.ends_with(|c: char| c.is_ascii_digit()), "{d}");
        assert!(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                .iter()
                .any(|m| d.contains(m)),
            "{d}"
        );
        assert_ne!(imap_date(30), d);
    }

    #[test]
    fn special_folder_detection_prefers_server_attributes() {
        // 163 的真实响应：属性优先
        assert_eq!(special_of("\\Sent", "&XfJT0ZAB-", "已发送"), "sent");
        assert_eq!(special_of("\\Drafts", "&g0l6P3ux-", "草稿箱"), "drafts");
        assert_eq!(special_of("\\Trash", "&XfJSIJZk-", "已删除"), "trash");
        assert_eq!(special_of("\\Junk", "&V4NXPpCuTvY-", "垃圾邮件"), "junk");
        assert_eq!(special_of("", "INBOX", "收件箱"), "inbox");
        // 没属性时按名字兜底
        assert_eq!(special_of("", "Sent Messages", "Sent Messages"), "sent");
        assert_eq!(special_of("", "&XfJSIJZk-", "已删除"), "trash");
        assert_eq!(special_of("", "Archive", "存档"), "");
    }

    #[test]
    fn parses_list_lines_and_tokens() {
        // 163 实际返回的行
        let f = parse_list_line("* LIST (\\Sent) \"/\" \"&XfJT0ZAB-\"").unwrap();
        assert_eq!(f.raw, "&XfJT0ZAB-");
        assert_eq!(f.name, "已发送");
        assert_eq!(f.delimiter, "/");
        assert_eq!(f.special, "sent");
        assert!(f.selectable);

        let f2 = parse_list_line("* LIST (\\Noselect \\HasChildren) \"/\" \"[Gmail]\"").unwrap();
        assert!(!f2.selectable);
        assert_eq!(f2.raw, "[Gmail]");

        let f3 = parse_list_line("* LIST () \"/\" \"INBOX\"").unwrap();
        assert_eq!(f3.special, "inbox");
        assert!(parse_list_line("* 42 EXISTS").is_none());
    }

    #[test]
    fn parses_fetch_metadata_and_literals() {
        // 元信息在字面量之前
        let head = "* 1 FETCH (UID 4242 FLAGS (\\Seen \\Flagged) RFC822.SIZE 20480 BODY[HEADER] {12}";
        assert_eq!(number_after(head, "UID"), Some(4242));
        assert_eq!(number_after(head, "RFC822.SIZE"), Some(20480));
        assert_eq!(paren_after(head, "FLAGS").unwrap(), "\\Seen \\Flagged");
        assert_eq!(trailing_literal_size(head.as_bytes()), Some(12));

        // 字面量提取（BODY[] {5}\r\nhello）
        let raw = b"* 1 FETCH (UID 7 BODY[] {5}\r\nhello)\r\na5 OK FETCH completed\r\n";
        assert_eq!(last_literal(raw).unwrap(), b"hello".to_vec());

        // 多个字面量时取最后一个（BODY[HEADER] + BODY[TEXT]）
        let raw2 = b"* 1 FETCH (BODY[HEADER] {3}\r\nabc BODY[TEXT] {4}\r\nwxyz)\r\n";
        assert_eq!(last_literal(raw2).unwrap(), b"wxyz".to_vec());
        assert_eq!(trailing_literal_size(b"* 1 FETCH (UID 1)\r\n"), None);
    }

    #[test]
    fn quotes_escaping_for_login() {
        assert_eq!(quote("a@b.com"), "\"a@b.com\"");
        assert_eq!(quote("p\"a\\s"), "\"p\\\"a\\\\s\"");
        assert_eq!(bracket_number("* OK [UIDVALIDITY 1] UIDs valid", "UIDVALIDITY"), Some(1));
        assert_eq!(bracket_number("* OK [UNSEEN 12] first unseen", "UNSEEN"), Some(12));
    }

    #[test]
    fn parses_gbk_message_into_readable_chinese() {
        // 端到端：造一封"GBK 但没声明 charset"的邮件（51job / 平安那种），
        // 走真实解析路径（header_from_raw / body_from_message），必须得到可读中文。
        let mut raw: Vec<u8> = Vec::new();
        raw.extend_from_slice(b"From: campus@quickmail.51job.com\r\n");
        raw.extend_from_slice(b"To: me@163.com\r\n");
        raw.extend_from_slice(b"Subject: ");
        raw.extend_from_slice(&[0xB8, 0xD0, 0xD0, 0xBB, 0xD3, 0xA6, 0xC6, 0xB8]); // 感谢应聘
        raw.extend_from_slice(b"\r\nDate: Mon, 1 Sep 2025 10:00:00 +0800\r\n");
        raw.extend_from_slice(b"Message-ID: <gbk-1@51job.com>\r\n");
        raw.extend_from_slice(b"Content-Type: text/plain\r\n"); // 故意不写 charset
        raw.extend_from_slice(b"Content-Transfer-Encoding: 8bit\r\n\r\n");
        raw.extend_from_slice(&[0xD0, 0xA3, 0xD4, 0xB0, 0xC6, 0xB5, 0xB5, 0xC0]); // 校园频道
        raw.extend_from_slice(b"\r\n");

        let head = header_from_raw(7, raw.len() as u32, false, false, &raw);
        assert_eq!(head.subject, "感谢应聘", "主题应解成中文而不是乱码");
        assert!(!looks_like_mojibake(&head.subject));
        assert_eq!(head.from_address, "campus@quickmail.51job.com");
        // mail-parser 的 message_id() 不带尖括号（前端 normalizeMessageId 也会去掉，两边一致）
        assert_eq!(head.message_id, "gbk-1@51job.com");

        let parsed = MessageParser::default().parse(&raw).expect("解析失败");
        let body = body_from_message(7, &parsed, &raw);
        assert_eq!(body.subject, "感谢应聘");
        assert_eq!(body.text.trim(), "校园频道");
        assert!(!looks_like_mojibake(&body.text));
    }

    #[test]
    fn parses_base64_gbk_message() {
        // base64 + GBK（国内 HTML 邮件最常见的组合）：必须从原始报文解码传输编码后再嗅探字符集
        let gbk: [u8; 8] = [0xD0, 0xA3, 0xD4, 0xB0, 0xC6, 0xB5, 0xB5, 0xC0]; // 校园频道
        let b64 = base64::engine::general_purpose::STANDARD.encode(gbk);
        let mut raw: Vec<u8> = Vec::new();
        raw.extend_from_slice(b"From: hr@example.com\r\n");
        raw.extend_from_slice(b"Subject: =?gb2312?B?");
        raw.extend_from_slice(b64.as_bytes());
        raw.extend_from_slice(b"?=\r\n");
        raw.extend_from_slice(b"Content-Type: text/plain; charset=\"gb2312\"\r\n");
        raw.extend_from_slice(b"Content-Transfer-Encoding: base64\r\n\r\n");
        raw.extend_from_slice(b64.as_bytes());
        raw.extend_from_slice(b"\r\n");

        let head = header_from_raw(9, raw.len() as u32, false, false, &raw);
        assert_eq!(head.subject, "校园频道", "RFC2047 主题应正常解码");

        let parsed = MessageParser::default().parse(&raw).expect("解析失败");
        let body = body_from_message(9, &parsed, &raw);
        assert_eq!(body.text.trim(), "校园频道", "base64 正文要正确解出中文");
        assert!(!looks_like_mojibake(&body.text));
    }

    #[test]
    fn decodes_gbk_body_without_charset() {
        // 「校园频道」的 GBK 字节；被当 UTF-8 解会变成 `У԰Ƶ��` 这种乱码
        let gbk = [0xD0u8, 0xA3, 0xD4, 0xB0, 0xC6, 0xB5, 0xB5, 0xC0];
        assert_eq!(decode_bytes(&gbk, None), "校园频道");
        assert_eq!(decode_bytes(&gbk, Some("gb2312")), "校园频道");
        assert_eq!(decode_bytes(&gbk, Some("GBK")), "校园频道");
        // 声明成 utf-8 但是 GBK 内容（国内发信系统常见）→ 靠打分纠正
        assert_eq!(decode_bytes(&gbk, Some("utf-8")), "校园频道");

        // 「校」单独两个字节 D0 A3 恰好是合法 UTF-8（У）→ 仍要靠打分选中文
        assert_eq!(decode_bytes(&[0xD0, 0xA3], None), "校");
        // 真实案例：「感谢应聘」→ 库里的乱码指纹是 `��лӦƸ`
        let thanks = [0xB8u8, 0xD0, 0xD0, 0xBB, 0xD3, 0xA6, 0xC6, 0xB8];
        assert_eq!(decode_bytes(&thanks, None), "感谢应聘");

        // UTF-8 内容不能被改坏
        assert_eq!(decode_bytes("中文测试".as_bytes(), None), "中文测试");
        assert_eq!(decode_bytes("中文测试".as_bytes(), Some("utf-8")), "中文测试");
        // 纯 ASCII 原样
        assert_eq!(decode_bytes(b"hello world", None), "hello world");
        assert_eq!(decode_bytes(b"", None), "");
        // 西欧文本（声明的 latin-1 要生效，不能被 GB18030 抢走）
        assert_eq!(decode_bytes(&[0xE9, 0x74, 0xE9], Some("iso-8859-1")), "été");
    }

    #[test]
    fn decodes_8bit_gbk_headers() {
        // 主题：GBK 明文的「感谢应聘农哈哈泉」（没有 RFC2047 编码字）
        let mut raw: Vec<u8> = b"From: campus@quickmail.51job.com\r\nSubject: ".to_vec();
        raw.extend_from_slice(&[0xB8, 0xD0, 0xD0, 0xBB, 0xD3, 0xA6, 0xC6, 0xB8]);
        raw.extend_from_slice(b"\r\nDate: Mon, 1 Sep 2025 10:00:00 +0800\r\n\r\n");
        assert_eq!(decode_raw_header(&raw, "Subject", "(fallback)"), "感谢应聘");

        // 折行续行的头要接起来（RFC2047 编码字这里也由我们自己解）
        let folded = b"Subject: =?utf-8?B?5rWL6K+V?=\r\n\tcontinued\r\nX: 1\r\n\r\n".to_vec();
        assert_eq!(decode_raw_header(&folded, "Subject", "兜底"), "测试 continued");

        // 相邻编码字之间的空白按 RFC2047 丢掉
        let two_words = b"Subject: =?utf-8?B?5rWL6K+V?= =?utf-8?B?5rWL6K+V?=\r\n\r\n".to_vec();
        assert_eq!(decode_raw_header(&two_words, "Subject", "("), "测试测试");

        // Q 编码 + GB2312 编码字（老国产发信系统常见；payload 以 = 开头是最容易写错的地方）
        let q = b"Subject: =?gb2312?Q?=D0=A3=D4=B0=C6=B5=B5=C0?=\r\n\r\n".to_vec();
        assert_eq!(decode_raw_header(&q, "Subject", "("), "校园频道");
        // Q 编码里 _ 代表空格、=XX 是字节
        assert_eq!(
            decode_raw_header(b"Subject: =?gb2312?Q?=D0=A3=D4=B0_=C6=B5?=\r\n\r\n", "Subject", "("),
            "校园 频"
        );

        // 纯 ASCII 头 → 原样
        let ascii = b"Subject: Hello there\r\n\r\n".to_vec();
        assert_eq!(decode_raw_header(&ascii, "Subject", "Hello there"), "Hello there");

        // 8-bit GBK 发件人显示名：「张三 <a@b.com>」
        let mut from: Vec<u8> = b"From: ".to_vec();
        from.extend_from_slice(&[0xD5, 0xC5, 0xC8, 0xFD]); // 张三
        from.extend_from_slice(b" <a@b.com>\r\n\r\n");
        assert_eq!(raw_display_name(&from, "From", "?"), "张三");

        // 只有地址、没有显示名 → 用 fallback
        assert_eq!(raw_display_name(b"From: <a@b.com>\r\n\r\n", "From", "?"), "?");
        // 原始头不存在 → 用 fallback
        assert_eq!(decode_raw_header(b"X: 1\r\n\r\n", "Subject", "兜底"), "兜底");
    }

    #[test]
    fn html_to_text_strips_tags_and_keeps_lines() {        // 纯 HTML 邮件必须能剥出可读文本（否则 text 字段会是一整段 <!DOCTYPE html>）
        let html = "<!DOCTYPE html><html><head><style>body{color:red}</style>\
                    <script>var x=1;</script></head><body><p>面试时间：2026-10-12 14:00</p>\
                    <div>地点：北京&amp;上海</div><br><p>请联系 HR&nbsp;老师</p></body></html>";
        let text = html_to_text(html);
        assert!(text.contains("面试时间：2026-10-12 14:00"), "{text}");
        assert!(text.contains("地点：北京&上海"), "{text}");
        assert!(text.contains("请联系 HR 老师"), "{text}");
        assert!(!text.contains('<'), "标签没剥干净：{text}");
        assert!(!text.contains("var x"), "script 内容没跳过：{text}");
        assert!(!text.contains("color:red"), "style 内容没跳过：{text}");

        assert!(looks_like_html("<!DOCTYPE html><html>…"));
        assert!(looks_like_html("<div>hi</div>"));
        assert!(!looks_like_html("面试时间：2026-10-12 14:00"));

        // 数字实体
        assert_eq!(html_to_text("<p>&#65;&#x42;&#xff1a;</p>"), "AB：");
    }

    /// 临时诊断：把某封邮件的原始头与每个 part 的字符集情况打出来（MAIL_TEST_UID 指定）。
    #[test]
    fn live_dump_raw_message() {
        let user = std::env::var("MAIL_TEST_USER").unwrap_or_default();
        let pass = std::env::var("MAIL_TEST_PASS").unwrap_or_default();
        let uid: u32 = std::env::var("MAIL_TEST_UID").ok().and_then(|v| v.parse().ok()).unwrap_or(0);
        if user.is_empty() || pass.is_empty() || uid == 0 {
            eprintln!("跳过 live_dump_raw_message：需要 MAIL_TEST_USER/MAIL_TEST_PASS/MAIL_TEST_UID");
            return;
        }
        let cfg = MailConfig {
            host: "imap.163.com".into(),
            port: 993,
            security: "ssl".into(),
            username: user,
            password: pass,
        };
        let mut conn = connect(&cfg).expect("连接失败");
        conn.select("INBOX").expect("SELECT 失败");
        // 先看这个 UID 在不在（打原始应答，排查"没有字面量"）
        let (status, untagged) = conn
            .cmd(&format!("UID FETCH {uid} (UID FLAGS RFC822.SIZE BODY.PEEK[])"))
            .expect("FETCH 失败");
        println!("\n===== uid {uid} 应答 =====");
        println!("状态行: {status}");
        for r in &untagged {
            println!(
                "未标记响应（原始 {} 字节）: {:?}",
                r.raw.len(),
                r.text.chars().take(160).collect::<String>()
            );
        }
        let raw = match untagged.iter().find_map(|r| last_literal(&r.raw)) {
            Some(v) => v,
            None => {
                println!("！！这个 UID 没有返回正文（可能已被删除/移动）");
                conn.logout();
                return;
            }
        };
        conn.logout();
        println!("\n===== uid {uid} 原始大小 {} 字节 =====", raw.len());

        // 1) 原始头部（前 1500 字节，lossy 只是为了看 Content-Type / charset）
        let head_end = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap_or(1500).min(1500);
        println!("--- 原始头部（前 {head_end} 字节，按 Latin-1 显示以看清字节）---");
        println!("{}", raw[..head_end].iter().map(|b| *b as char).collect::<String>());

        // 2) mail-parser 解析出的结构
        let msg = MessageParser::default().parse(&raw).expect("mail-parser 解析失败");
        println!("--- mail-parser 视角 ---");
        println!("subject()      = {:?}", msg.subject().unwrap_or("(无)"));
        println!("message_id()   = {:?}", msg.message_id().unwrap_or("(无)"));

        for (i, part) in msg.parts.iter().enumerate() {
            use mail_parser::MimeHeaders;
            let ct = part
                .content_type()
                .map(|c| format!("{}/{}", c.ctype(), c.subtype().unwrap_or("?")))
                .unwrap_or_else(|| "(无)".into());
            let charset = part
                .content_type()
                .and_then(|c| c.attribute("charset").map(|s| s.to_string()))
                .unwrap_or_else(|| "(未声明)".into());
            let cte = part
                .content_transfer_encoding()
                .map(|e| format!("{e:?}"))
                .unwrap_or_else(|| "(无)".into());
            let contents = part.contents();
            let as_utf8 = std::str::from_utf8(contents);
            println!(
                "part[{i}] {ct} charset={charset} cte={cte} 字节={} utf8合法={}",
                contents.len(),
                as_utf8.is_ok()
            );
            if part.is_text() {
                let decoded = part.text_contents().unwrap_or("(空)");
                println!("    text_contents() 前 80 字: {:?}", decoded.chars().take(80).collect::<String>());
                // 用 GB18030 手工解一遍对照
                let (gbk, _, _) = encoding_rs::GB18030.decode(contents);
                println!("    GB18030 手工解 前 80 字: {:?}", gbk.chars().take(80).collect::<String>());
            }
        }
        println!();
    }

    /// 临时诊断：探测服务器能力 —— 是否支持 IDLE（实时推送）、STATUS 的耗时。
    #[test]
    fn live_probe_idle_capability() {
        use std::time::{Duration, Instant};
        let user = std::env::var("MAIL_TEST_USER").unwrap_or_default();
        let pass = std::env::var("MAIL_TEST_PASS").unwrap_or_default();
        if user.is_empty() || pass.is_empty() {
            eprintln!("跳过 live_probe_idle_capability：未设置 MAIL_TEST_USER / MAIL_TEST_PASS");
            return;
        }
        let host = std::env::var("MAIL_TEST_HOST").unwrap_or_else(|_| "imap.163.com".into());
        let cfg = MailConfig {
            host: host.clone(),
            port: 993,
            security: "ssl".into(),
            username: user,
            password: pass,
        };
        let mut conn = connect(&cfg).expect("连接失败");

        // 1) CAPABILITY：找 IDLE
        let (status, untagged) = conn.cmd("CAPABILITY").expect("CAPABILITY 失败");
        let caps = untagged
            .iter()
            .map(|r| r.text.trim().to_string())
            .collect::<Vec<_>>()
            .join(" ");
        println!("\n===== {host} 能力探测 =====");
        println!("{caps}");
        println!("支持 IDLE（实时推送）: {}", caps.to_ascii_uppercase().contains("IDLE"));
        println!("支持 UIDPLUS: {}", caps.to_ascii_uppercase().contains("UIDPLUS"));
        println!("支持 ID: {}", caps.to_ascii_uppercase().contains("ID"));
        println!("支持 LITERAL+: {}", caps.to_ascii_uppercase().contains("LITERAL+"));
        println!("状态行: {status}");

        // 2) STATUS：轻量查新邮件（不 SELECT，不拉头）的耗时
        conn.select("INBOX").expect("SELECT 失败");
        for label in ["MESSAGES UNSEEN", "MESSAGES", "UIDNEXT"] {
            let t0 = Instant::now();
            let res = conn.ok(&format!("STATUS INBOX ({label})"));
            match res {
                Ok(lines) => println!(
                    "STATUS INBOX ({label})：{:?} → {}",
                    t0.elapsed(),
                    lines.iter().map(|r| r.text.trim()).collect::<Vec<_>>().join(" | ")
                ),
                Err(e) => println!("STATUS INBOX ({label}) 失败：{e}"),
            }
        }

        // 3) IDLE：发 IDLE 看服务器是否回 `+ idling`，并观察是否主动推送
        // native-tls 的 TlsStream 不暴露 set_read_timeout，要拿底层 TcpStream
        conn.reader
            .get_mut()
            .get_ref()
            .set_read_timeout(Some(Duration::from_secs(8)))
            .ok();
        conn.write_raw(b"a99 IDLE\r\n").expect("发送 IDLE 失败");
        let t0 = Instant::now();
        match conn.read_reply() {
            Ok(r) => println!("\nIDLE 应答（{:?}）：{:?}", t0.elapsed(), r.text.trim()),
            Err(e) => println!("\nIDLE 没有应答（{:?}）：{e}", t0.elapsed()),
        }
        // 挂 8 秒，看服务器会不会主动推东西（EXISTS/RECENT/FETCH）
        let mut pushes = 0;
        loop {
            match conn.read_reply() {
                Ok(r) => {
                    pushes += 1;
                    println!("IDLE 期间收到推送：{:?}", r.text.trim());
                    if pushes >= 5 {
                        break;
                    }
                }
                Err(_) => {
                    println!("IDLE 挂起 8 秒内没有推送（正常：这期间没有新邮件）");
                    break;
                }
            }
        }
        // 结束 IDLE（必须把 a99 的应答读完，否则连接会标签错位）
        conn.write_raw(b"DONE\r\n").ok();
        for _ in 0..5 {
            match conn.read_reply() {
                Ok(r) => {
                    let done = r.text.starts_with("a99 ");
                    println!("DONE 应答：{:?}", r.text.trim());
                    if done {
                        break;
                    }
                }
                Err(e) => {
                    println!("DONE 读取失败：{e}");
                    break;
                }
            }
        }
        let _ = conn.reader.get_mut().get_ref().set_read_timeout(Some(IO_TIMEOUT));
        conn.logout();
        println!();
    }

    /// 毫秒时间戳 → 可读 UTC 时间（只为测试输出好看，不引 chrono）
    fn fmt_utc(ms: i64) -> String {
        if ms <= 0 {
            return "未知".into();
        }
        let secs = ms / 1000;
        let (y, m, d) = civil_from_days(secs.div_euclid(86_400));
        let rem = secs.rem_euclid(86_400);
        format!("{y}-{m:02}-{d:02} {:02}:{:02} UTC", rem / 3600, (rem % 3600) / 60)
    }

    /// **真机 IMAP 冒烟测试**（默认跳过）：连接→文件夹→邮件头→正文→附件全链路。
    ///
    /// ```text
    /// $env:MAIL_TEST_USER="you@163.com"; $env:MAIL_TEST_PASS="授权码"
    /// cargo test --lib live_imap -- --nocapture
    /// ```
    #[test]
    fn live_imap_smoke() {
        let user = std::env::var("MAIL_TEST_USER").unwrap_or_default();
        let pass = std::env::var("MAIL_TEST_PASS").unwrap_or_default();
        if user.is_empty() || pass.is_empty() {
            eprintln!("跳过 live_imap_smoke：未设置 MAIL_TEST_USER / MAIL_TEST_PASS");
            return;
        }
        let host = std::env::var("MAIL_TEST_HOST").unwrap_or_else(|_| {
            let lower = user.to_ascii_lowercase();
            if lower.ends_with("@qq.com") {
                "imap.qq.com".into()
            } else if lower.ends_with("@126.com") {
                "imap.126.com".into()
            } else if lower.ends_with("@gmail.com") {
                "imap.gmail.com".into()
            } else {
                "imap.163.com".into()
            }
        });
        let cfg = MailConfig {
            host: host.clone(),
            port: 993,
            security: "ssl".into(),
            username: user.clone(),
            password: pass,
        };

        let probe = probe(&cfg).expect("连接/登录失败");
        println!("\n=== {} 连接成功 ===", host);
        println!("可读文件夹 {} 个：", probe.folders.len());
        for f in &probe.folders {
            println!("  • {:<10} raw={:<20} special={}", f.name, f.raw, f.special);
        }
        println!(
            "收件箱 {} 封，未读 {} 封，UIDVALIDITY={}",
            probe.inbox_exists, probe.inbox_unseen, probe.uid_validity
        );
        assert!(!probe.folders.is_empty(), "没有任何可读文件夹");
        assert!(
            probe.folders.iter().any(|f| f.special == "inbox"),
            "没有识别出收件箱"
        );

        let batch = sync_headers(&cfg, "INBOX", 30, 5, None).expect("拉取邮件头失败");
        println!(
            "\n邮件头：EXISTS={} UIDVALIDITY={} 拉到 {} 封",
            batch.exists,
            batch.uid_validity,
            batch.headers.len()
        );
        for h in &batch.headers {
            println!(
                "  • [{}] {} | {} | {} | {} KB | 预览: {}",
                h.uid,
                fmt_utc(h.date),
                h.from_address,
                h.subject,
                h.size / 1024,
                h.preview.chars().take(40).collect::<String>().replace('\n', " ")
            );
            assert!(!h.subject.is_empty(), "有邮件主题解析成了空");
        }

        if let Some(first) = batch.headers.first() {
            let body = fetch_body(&cfg, "INBOX", first.uid).expect("拉取正文失败");
            println!(
                "\n正文：主题「{}」| text {} 字 | html {} 字 | 附件 {} 个",
                body.subject,
                body.text.chars().count(),
                body.html.chars().count(),
                body.attachments.len()
            );
            for a in &body.attachments {
                println!("  • 附件 {}（{}，{} KB）", a.name, a.mime, a.size / 1024);
            }
            let snippet: String = body
                .text
                .chars()
                .take(160)
                .collect::<String>()
                .replace(['\r', '\n'], " ");
            println!("  片段：{snippet}");
        }
        println!("\n=== 全链路通过（连接 / 文件夹 / 邮件头 / 正文）===\n");
    }
