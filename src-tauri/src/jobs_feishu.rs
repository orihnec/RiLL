//! 飞书 OAuth 只接收本机回调；凭据交换和读取仍使用现有 HTTP 插件。
use std::{
    io::{Read, Write}, net::{TcpListener, TcpStream},
    sync::{atomic::{AtomicBool, Ordering}, mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{State, Url};

const ADDRESS: &str = "127.0.0.1:43829";
const CALLBACK: &str = "/feishu/callback";
type Reply = Result<String, String>;

struct Pending {
    state: String,
    canceled: Arc<AtomicBool>,
    receiver: Option<mpsc::Receiver<Reply>>,
}

#[derive(Default)]
pub struct FeishuCallback(Mutex<Option<Pending>>);

#[tauri::command]
pub fn jobs_feishu_start_callback(state: String, callback: State<'_, FeishuCallback>) -> Result<(), String> {
    if state.len() != 64 || !state.bytes().all(|c| c.is_ascii_hexdigit()) { return Err("授权状态标识无效".into()); }
    let mut pending = callback.0.lock().map_err(|_| "授权状态不可用")?;
    if pending.is_some() { return Err("已有飞书授权正在进行，请先取消或等待完成".into()); }
    let listener = TcpListener::bind(ADDRESS).map_err(|_| "本地授权端口 43829 被占用，请关闭其他授权窗口后重试")?;
    listener.set_nonblocking(true).map_err(|_| "无法启动本地授权回调")?;
    let (sender, receiver) = mpsc::channel();
    let canceled = Arc::new(AtomicBool::new(false));
    *pending = Some(Pending { state: state.clone(), canceled: canceled.clone(), receiver: Some(receiver) });
    tauri::async_runtime::spawn_blocking(move || { let _ = sender.send(receive(listener, &state, canceled)); });
    Ok(())
}

#[tauri::command]
pub async fn jobs_feishu_wait_callback(state: String, callback: State<'_, FeishuCallback>) -> Result<String, String> {
    let receiver = {
        let mut pending = callback.0.lock().map_err(|_| "授权状态不可用")?;
        let session = pending.as_mut().filter(|p| p.state == state).ok_or("授权会话已结束")?;
        session.receiver.take().ok_or("授权已在等待中")?
    };
    let result = tauri::async_runtime::spawn_blocking(move || receiver.recv()
        .unwrap_or_else(|_| Err("本地授权回调已结束，请重试".into())))
        .await.map_err(|_| "本地授权回调异常")?;
    let mut pending = callback.0.lock().map_err(|_| "授权状态不可用")?;
    if pending.as_ref().is_some_and(|p| p.state == state) { *pending = None; }
    result
}

#[tauri::command]
pub fn jobs_feishu_cancel_callback(state: String, callback: State<'_, FeishuCallback>) -> Result<(), String> {
    let mut pending = callback.0.lock().map_err(|_| "授权状态不可用")?;
    if let Some(session) = pending.as_ref().filter(|p| p.state == state) {
        session.canceled.store(true, Ordering::Relaxed);
        if session.receiver.is_some() { *pending = None; }
    }
    Ok(())
}

fn receive(listener: TcpListener, state: &str, canceled: Arc<AtomicBool>) -> Reply {
    let deadline = Instant::now() + Duration::from_secs(300);
    while Instant::now() < deadline {
        if canceled.load(Ordering::Relaxed) { return Err("已取消飞书授权".into()); }
        match listener.accept() {
            Ok((mut stream, address)) if address.ip().is_loopback() => {
                if let Some(result) = handle(&mut stream, state) { return result; }
            }
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(80)),
            Err(_) => return Err("本地授权回调失败，请重试".into()),
        }
    }
    Err("授权等待超过 5 分钟，请重新连接".into())
}

fn parse_callback(request: &str, state: &str) -> Option<Reply> {
    let mut parts = request.lines().next()?.split_whitespace();
    if parts.next()? != "GET" { return None; }
    let target = parts.next()?;
    if !target.starts_with('/') || target.starts_with("//") { return None; }
    let url = Url::parse(&format!("http://{ADDRESS}{target}")).ok()?;
    if url.path() != CALLBACK { return None; }
    let pairs: Vec<_> = url.query_pairs().collect();
    let states: Vec<_> = pairs.iter().filter(|(key, _)| key == "state").collect();
    if states.len() != 1 || states[0].1 != state { return None; }
    if pairs.iter().any(|(key, _)| key == "error") { return Some(Err("飞书授权被拒绝，请重新连接".into())); }
    let codes: Vec<_> = pairs.iter().filter(|(key, _)| key == "code").collect();
    if codes.len() != 1 || codes[0].1.is_empty() || codes[0].1.len() > 4096 { return None; }
    Some(Ok(codes[0].1.to_string()))
}

fn handle(stream: &mut TcpStream, state: &str) -> Option<Reply> {
    // Windows 的 accept 可能继承监听器的非阻塞模式；完整读取分段请求后再响应。
    stream.set_nonblocking(false).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(1))).ok()?;
    stream.set_write_timeout(Some(Duration::from_secs(1))).ok()?;
    let mut input = Vec::new();
    let mut buffer = [0u8; 1024];
    while input.len() < 8192 {
        let count = stream.read(&mut buffer).ok()?;
        if count == 0 { break; }
        input.extend_from_slice(&buffer[..count]);
        if input.windows(4).any(|bytes| bytes == b"\r\n\r\n") { break; }
    }
    let result = std::str::from_utf8(&input).ok().and_then(|request| parse_callback(request, state));
    let (status, message) = if result.is_some() {
        ("200 OK", "授权回调已接收，请返回 RiLL 查看连接结果。")
    } else { ("403 Forbidden", "无效的授权回调，请从 RiLL 重新连接。") };
    let body = format!("<!doctype html><meta charset=utf-8><title>RiLL 飞书连接</title><p>{message}</p>");
    let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\n\r\n{body}", body.len());
    let _ = stream.write_all(response.as_bytes());
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn callback_requires_exact_state_and_path() {
        assert_eq!(parse_callback("GET /feishu/callback?state=valid&code=abc HTTP/1.1\r\n", "valid"), Some(Ok("abc".into())));
        for request in ["GET /feishu/callback?state=other&code=abc HTTP/1.1", "GET /other?state=valid&code=abc HTTP/1.1",
            "POST /feishu/callback?state=valid&code=abc HTTP/1.1", "GET /feishu/callback?state=valid&state=other&code=abc HTTP/1.1",
            "GET //attacker/feishu/callback?state=valid&code=abc HTTP/1.1", "GET /feishu/callback?state=valid&code=abc&code=def HTTP/1.1"] {
            assert!(parse_callback(request, "valid").is_none());
        }
    }
    #[test]
    fn callback_handles_denial() {
        assert!(parse_callback("GET /feishu/callback?state=valid&error=access_denied HTTP/1.1", "valid").unwrap().is_err());
    }
    #[test]
    fn local_listener_rejects_invalid_state_then_completes() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let canceled = Arc::new(AtomicBool::new(false));
        let thread = std::thread::spawn(move || receive(listener, "test-state", canceled));
        for (state, expected) in [("wrong", "403 Forbidden"), ("test-state", "200 OK")] {
            let mut stream = TcpStream::connect(address).unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            let request = format!("GET /feishu/callback?state={state}&code=one-time-code HTTP/1.1\r\nHost: {address}\r\n\r\n");
            let (first, remaining) = request.split_at(request.find("Host:").unwrap());
            stream.write_all(first.as_bytes()).unwrap();
            // 在空闲读取间隔内模拟浏览器分段发送 HTTP 头，不能提前断开回调。
            std::thread::sleep(Duration::from_millis(120));
            stream.write_all(remaining.as_bytes()).unwrap();
            let mut response = String::new();
            stream.read_to_string(&mut response).unwrap();
            assert!(response.contains(expected));
            assert!(!response.contains("one-time-code"));
            assert!(!response.contains("test-state"));
        }
        assert_eq!(thread.join().unwrap(), Ok("one-time-code".into()));
        assert!(TcpListener::bind(address).is_ok());
    }
    #[test]
    fn cancel_releases_listener() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let canceled = Arc::new(AtomicBool::new(true));
        assert!(receive(listener, "state", canceled).is_err());
        assert!(TcpListener::bind(address).is_ok());
    }
}
