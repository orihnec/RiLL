//! IMAP 协议层：连接、登录、命令-应答循环。**只认字节，不认识"邮件"**。

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use native_tls::TlsConnector;

mod fetch;
mod text;
mod list;
mod mutate;


pub(crate) use list::*;
pub(crate) use text::*;
pub(crate) use mutate::*;

use crate::error::AppResult;

use super::model::MailConfig;

/// TLS 连接类型
type TlsStream = native_tls::TlsStream<TcpStream>;

/// 单次网络读写超时：服务器卡住时给出可读错误，而不是永远转圈
pub(crate) const IO_TIMEOUT: Duration = Duration::from_secs(30);

/// 一条服务端响应：`text` 便于解析元信息，`raw` 保留字节（正文/邮件头在 `{N}` 字面量里）
pub(crate) struct Reply {
    pub(crate) text: String,
    pub(crate) raw: Vec<u8>,
}

pub(crate) struct Conn {
    pub(crate) reader: BufReader<TlsStream>,
    pub(crate) tag: u32,
    /// 网易系要在 SELECT 前发 ID
    pub(crate) need_id: bool,
}

impl Conn {
    pub(crate) fn open(cfg: &MailConfig) -> Result<Conn, String> {
        let connector = TlsConnector::builder()
            .build()
            .map_err(|e| format!("初始化 TLS 失败：{e}"))?;
        let tcp = TcpStream::connect((cfg.host.as_str(), cfg.port))
            .map_err(|e| network_hint(&cfg.host, cfg.port, &e.to_string()))?;
        let _ = tcp.set_read_timeout(Some(IO_TIMEOUT));
        let _ = tcp.set_write_timeout(Some(IO_TIMEOUT));

        let starttls = cfg.security.eq_ignore_ascii_case("starttls");
        let (tls, tag, greeting_done) = if starttls {
            // 明文问候 → STARTTLS → 同一 socket 上升级 TLS（143 端口的企业邮箱）
            let mut plain = BufReader::new(tcp);
            let mut greeting = String::new();
            plain
                .read_line(&mut greeting)
                .map_err(|e| format!("读取服务器问候失败：{e}"))?;
            if !is_ok_greeting(&greeting) {
                return Err(format!("服务器拒绝连接：{}", greeting.trim()));
            }
            plain
                .get_mut()
                .write_all(b"a1 STARTTLS\r\n")
                .and_then(|_| plain.get_mut().flush())
                .map_err(|e| format!("发送 STARTTLS 失败：{e}"))?;
            let mut resp = String::new();
            plain
                .read_line(&mut resp)
                .map_err(|e| format!("读取 STARTTLS 应答失败：{e}"))?;
            if !resp.to_ascii_uppercase().contains("OK") {
                return Err(format!(
                    "服务器不支持 STARTTLS（{}）：请改用 SSL 993 端口",
                    resp.trim()
                ));
            }
            if !plain.buffer().is_empty() {
                return Err("STARTTLS 前收到多余数据，连接不可信".into());
            }
            let tls = connector
                .connect(cfg.host.as_str(), plain.into_inner())
                .map_err(|e| network_hint(&cfg.host, cfg.port, &e.to_string()))?;
            (tls, 1, true)
        } else {
            let tls = connector
                .connect(cfg.host.as_str(), tcp)
                .map_err(|e| network_hint(&cfg.host, cfg.port, &e.to_string()))?;
            (tls, 0, false)
        };

        let mut reader = BufReader::new(tls);
        if !greeting_done {
            let mut greeting = String::new();
            reader
                .read_line(&mut greeting)
                .map_err(|e| format!("读取服务器问候失败：{e}"))?;
            if !is_ok_greeting(&greeting) {
                return Err(format!("服务器拒绝连接：{}", greeting.trim()));
            }
        }

        Ok(Conn {
            reader,
            tag,
            need_id: needs_id(&cfg.host),
        })
    }

    pub(crate) fn write_raw(&mut self, bytes: &[u8]) -> Result<(), String> {
        let w = self.reader.get_mut();
        w.write_all(bytes).map_err(|e| format!("发送命令失败：{e}"))?;
        w.flush().map_err(|e| format!("发送命令失败：{e}"))
    }

    /// 读一条完整响应（含 `{N}` 字面量的字节精确读取）。
    pub(crate) fn read_reply(&mut self) -> Result<Reply, String> {
        let mut raw: Vec<u8> = Vec::new();
        loop {
            let mut chunk: Vec<u8> = Vec::new();
            let n = self
                .reader
                .read_until(b'\n', &mut chunk)
                .map_err(|e| format!("读取响应失败：{e}"))?;
            if n == 0 {
                return Err("连接被服务器关闭".into());
            }
            raw.extend_from_slice(&chunk);
            // 行尾 `{N}` / `{N+}` = 后面紧跟 N 字节字面量（正文），必须原样读走
            if let Some(size) = trailing_literal_size(&chunk) {
                let mut data = vec![0u8; size];
                self.reader
                    .read_exact(&mut data)
                    .map_err(|e| format!("读取字面量失败（{size} 字节）：{e}"))?;
                raw.extend_from_slice(&data);
                continue; // 字面量之后同一响应还在继续
            }
            break;
        }
        Ok(Reply {
            text: String::from_utf8_lossy(&raw).into_owned(),
            raw,
        })
    }

    /// 发命令并读到它的 tagged 应答；返回 (状态行, 未标记响应行)。
    pub(crate) fn cmd(&mut self, text: &str) -> Result<(String, Vec<Reply>), String> {
        self.tag += 1;
        let tag = format!("a{}", self.tag);
        self.write_raw(format!("{tag} {text}\r\n").as_bytes())?;
        let prefix = format!("{tag} ");
        let mut untagged = Vec::new();
        loop {
            let reply = self.read_reply()?;
            if reply.text.starts_with(&prefix) {
                return Ok((reply.text.trim_end().to_string(), untagged));
            }
            untagged.push(reply);
        }
    }

    pub(crate) fn ok(&mut self, text: &str) -> Result<Vec<Reply>, String> {
        let (status, untagged) = self.cmd(text)?;
        // aN OK ... / aN NO ... / aN BAD ...
        let upper = status.to_ascii_uppercase();
        if !upper.contains(" OK") {
            return Err(format!("命令 `{}` 被拒绝：{}", first_word(text), status));
        }
        Ok(untagged)
    }

    pub(crate) fn login(&mut self, user: &str, pass: &str) -> Result<(), String> {
        let (status, _) = self.cmd(&format!(
            "LOGIN {} {}",
            quote(user),
            quote(pass)
        ))?;
        if !status.to_ascii_uppercase().contains(" OK") {
            return Err(login_hint(&status));
        }
        Ok(())
    }

    /// 网易系要求：SELECT 前先 ID，否则 `NO SELECT Unsafe Login`（163 实测）。
    pub(crate) fn send_id(&mut self) -> Result<(), String> {
        self.ok(
            "ID (\"name\" \"RiliAgent\" \"version\" \"0.1.0\" \"vendor\" \"riliagent\" \
             \"support-email\" \"support@riliagent.local\")",
        )
        .map(|_| ())
    }

    pub(crate) fn logout(&mut self) {
        let _ = self.cmd("LOGOUT");
    }

    /// 服务器能力（大写拼接），用来判断支不支持 IDLE 这类扩展。
    pub(crate) fn capability(&mut self) -> Result<String, String> {
        let untagged = self.ok("CAPABILITY")?;
        Ok(untagged
            .iter()
            .map(|r| r.text.trim().to_ascii_uppercase())
            .collect::<Vec<_>>()
            .join(" "))
    }
}

pub(crate) fn connect(cfg: &MailConfig) -> AppResult<Conn> {
    cfg.validate()?;
    let mut conn = Conn::open(cfg)?;
    conn.login(&cfg.username, &cfg.password)?;
    if conn.need_id {
        conn.send_id()?;
    }
    Ok(conn)
}










