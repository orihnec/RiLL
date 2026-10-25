/// 后端统一错误。
///
/// 为什么需要它：以前全部是 `Result<_, String>`，调用方无法区分"网络断了 / 授权码错了 /
/// 服务器拒绝 / 解析失败"，于是每一层都要自己猜、自己拼提示 —— 这就是防御性代码的来源。
/// 现在分层只需要匹配类型，人话提示只在 `Display` 里写一次。
#[derive(Debug)]
pub enum AppError {
    /// 授权码错误、没开 IMAP、需要二次验证
    Auth(String),
    /// 连不上、超时、DNS
    Network(String),
    /// 服务器返回非 OK / 协议异常
    Protocol(String),
    /// MIME、编码、文档解析失败
    Parse(String),
    /// 不支持的类型（附件）
    Unsupported(String),
    /// 已在更下层写好的提示（保持原文，仅做类型统一）
    Other(String),
    Io(std::io::Error),
}

impl AppError {
    pub fn auth(msg: impl Into<String>) -> Self {
        Self::Auth(msg.into())
    }
    pub fn network(msg: impl Into<String>) -> Self {
        Self::Network(msg.into())
    }
    pub fn protocol(msg: impl Into<String>) -> Self {
        Self::Protocol(msg.into())
    }
    pub fn parse(msg: impl Into<String>) -> Self {
        Self::Parse(msg.into())
    }
    pub fn unsupported(msg: impl Into<String>) -> Self {
        Self::Unsupported(msg.into())
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Auth(m) => write!(f, "{m}"),
            Self::Network(m) => write!(f, "网络错误：{m}"),
            Self::Protocol(m) => write!(f, "服务器返回异常：{m}"),
            Self::Parse(m) => write!(f, "解析失败：{m}"),
            Self::Unsupported(m) => write!(f, "{m}"),
            Self::Other(m) => write!(f, "{m}"),
            Self::Io(e) => write!(f, "文件读写失败：{e}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<String> for AppError {
    fn from(m: String) -> Self {
        Self::Other(m)
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}

/// `#[tauri::command]` 的错误必须可序列化：前端只需要拿到人话字符串。
impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
