# Rust 后端重构方案（v1）

> 目标：**层清楚、错误可辨、防御性写法降到最少、新增功能有明确落点**。
> 约束：命令名与字段名**不变** → 前端零改动；数据库零改动。

---

## 1. 现状

| 文件 | 行数 | 职责数 | 说明 |
|---|---|---|---|
| `src/main.rs` | 6 | 1 | 入口，不动 |
| `src/lib.rs` | 138 | 4 | 插件注册 + 窗口/托盘 + 命令表 + `show_window/toggle_window` |
| `src/mail.rs` | **2598** | 6 | 模型 / IMAP 协议 / 编码 / MIME / 同步 / 监听线程 **全在一个文件** |

`mail.rs` 里的规模指标：

| 指标 | 数量 | 含义 |
|---|---|---|
| `fn` | 54 | 8 个 `#[tauri::command]` + 46 个内部函数 |
| `Result<_, String>` | 全部 | 错误只有字符串，**无法区分** 网络断 / 认证失败 / 服务器拒绝 / 解析失败 |
| `unwrap_or*` | 57 | 大量"取不到就给默认值" → 该报错的地方静默降级 |
| `.ok()` | 13 | 吞掉错误 |
| `map_err` | 32 | 同一个 `String` 转换在 32 处重复 |
| `?` | 91 | 正常，但错误在传递中丢失语义 |
| `if let Some` | 24 | 层层可选值判断 |

**一句话诊断**：把 6 类完全不同的东西塞进一个 2600 行的文件，错误类型退化成字符串，
于是"防御性编程"变成了默认写法（每层都猜"可能是空的/可能失败"）—— 这才是维护痛苦的根源，
而不是行数本身。

---

## 2. 目标结构（细粒度 + 硬性上限）

**上限是硬性的**：单文件 **≤250 行**（`imap/fetch.rs` 至多 220）、单函数 **≤40 行**、嵌套 ≤3 层、
`unwrap_or*` 每千行 ≤3、除命令最外层外**不许出现 `Result<_, String>`**。

```
src-tauri/src/
├─ main.rs             6      入口（不动）
├─ lib.rs           ≤110     装配：插件 + 托盘 + 命令表
├─ window.rs         ~25     show / toggle                       ✅ 已完成
├─ error.rs          ~50     AppError{Auth,Network,Protocol,Parse,Io} + Display
├─ mail/
│  ├─ mod.rs         ≤90     8 个 #[tauri::command]（唯一允许 map_err 的地方）
│  ├─ model.rs      ≤160     MailConfig/FolderInfo/AccountProbe/MailHeader/HeaderBatch/MailBody/AttachmentMeta
│  ├─ encoding/
│  │  ├─ mod.rs     ≤100     对外入口：decode_header_text / decode_raw_header / decode_mutf7
│  │  ├─ word.rs    ≤140     RFC2047 encoded-word 扫描与拼接
│  │  ├─ part.rs    ≤120     base64 / QP / charset → String
│  │  └─ mojibake.rs ≤80     looks_like_mojibake / badness / 四层回退策略
│  ├─ mime/
│  │  ├─ mod.rs     ≤130     mail-parser → MailHeader（主题/发件人/msg-id/参与者）
│  │  ├─ body.rs    ≤160     mail-parser → MailBody（正文字符集、附件元信息）
│  │  └─ html.rs    ≤150     html_to_text / decode_entity / 链接抽取
│  ├─ imap/
│  │  ├─ mod.rs     ≤120     Conn：TCP/TLS、GREETING、LOGIN、ID、命令-读取循环
│  │  ├─ reply.rs   ≤130     Reply 解析（tag、状态行、字面量切分）
│  │  ├─ list.rs    ≤130     `* LIST` 解析、special 判定、modified UTF-7
│  │  ├─ fetch.rs   ≤220     UID FETCH HEADER / BODY 的组装与批处理
│  │  └─ mutate.rs  ≤120     STORE / MOVE / EXPUNGE
│  ├─ sync.rs       ≤180     probe / sync_headers（UID 游标 + UIDVALIDITY）
│  └─ watch.rs      ≤230     watchers 注册表 / watch_loop（IDLE + STATUS）
└─ attach/                   新功能（见 §7）
   ├─ mod.rs         ≤50     2 个命令
   ├─ kind.rs        ≤80     扩展名/MIME → 类型 + 上限
   ├─ text.rs       ≤120     txt/md/csv/json + 编码识别
   ├─ pdf.rs         ≤80     pdf-extract
   └─ docx.rs        ≤70     zip + word/document.xml
```

对照现状：`mail.rs` **2598 行 → 16 个文件，最大 230 行**。

**分层规则（写进 DEV-GUIDE）**

```
command（mail/mod.rs） → 业务（sync / body / watch） → 协议（imap）+ 解析（mime / encoding） → 传输（TLS/TCP）
```

- 命令层只允许：参数校验、DTO 转换、调业务、最后 `map_err` 一次；
- 业务层不许拼接 IMAP 字符串；
- 解析层不许做 IO；
- 传输层不认识"邮件"，只认字节。

### S6 实际做法（与最初设想有调整）

| 层 | 错误类型 | 说明 |
|---|---|---|
| Tauri 命令（8 个） | `AppResult<T>` | 前端仍只拿到字符串（`AppError: Serialize`） |
| 业务入口（probe / sync_headers / fetch_body / save_attachment / set_flags / move_messages / watch_session） | `AppResult<T>` | **类型边界到这里** |
| 协议层 `imap::Conn`（open / cmd / ok / login …） | `Result<_, String>` **保持** | 它只产出"网络/协议"错误，`From<String>` 自动包成 `AppError::Other`；强改要动 40+ 处 `format!`，收益只是把边界再往下挪一层 |
| 解析层（encoding / mime / html） | 无错误 / `Option` | 纯函数，本来就不该有防御分支 |

配套：

1. `AppError` 增加 `Other(String)`（保留原文提示）+ `From<String>`，下层 `String` 可用 `?` 冒泡；
2. `MailConfig::validate()`：host / port / 账号 / 授权码校验只在一处（`connect()` 第一行），此前**没有**统一入口；
3. `blocking()` 放开为 `E: Display`，同时接受 `AppError` 与 `String` 闭包，并把 panic 转成可读错误；
4. `.ok()` 审计：剩余 9 处全是"数字/utf8 解析失败即视为没有"的合法用法，没有吞业务错误；
5. `unwrap_or*` 审计：剩余都是合法默认（端口 993、超时 30s、`Option` 缺省）。

### 前端同样的上限

| 文件 | 现状 | 目标 |
|---|---|---|
| `modules/mail/service.ts` | 1253 行 | 拆 5 个：`accounts.ts` / `threads.ts` / `messages.ts` / `bodies.ts` / `attachments.ts`（每个 ≤250，barrel 再导出） |
| `modules/mail/hooks/useMailWorkspace.ts` | 683 行 | ≤250：`useMailAccounts`（已有）、`useMailThreads`、`useMailThreadActions`、`useMailAi` |
| 组件 | 已 ≤200 | 保持 |

---

## 3. 要删的防御性写法（逐条给对照）

### 3.1 错误类型：`Result<T, String>` → `Result<T, AppError>`

```rust
// 现在（每个函数都自带一段手写提示）
.map_err(|e| format!("连接失败：{e}"))?

// 之后（提示由 Display 统一给，函数体只写 `?`）
#[derive(Debug)]
pub enum AppError {
    Auth(String),      // 授权码错误 / 需要开启 IMAP
    Network(String),   // 连不上 / 超时
    Protocol(String),  // 服务器返回非 OK
    Parse(String),     // MIME/编码解析失败
    Io(std::io::Error),
}
impl AppError { pub fn hint(&self) -> String { /* 只在 Display 里写一次人话 */ } }
```

前端仍然只收到字符串 —— 契约不变，但**Rust 内部能按类型决定重试/退出**。

### 3.2 `unwrap_or*` 只在"真的可选"处使用

```rust
// 现在：取不到就当空字符串，问题被吞
let name = header_from(...).unwrap_or_default();

// 之后：区分"服务器没给"和"解析失败"
let name = header.optional_string("Subject").unwrap_or_else(|| "(无主题)".into());
// 解析失败会走 Parse 错误，不会静默变成空
```

目标：`unwrap_or*` 57 → **≤15**（保留的都是 `Option` 的合法默认，如 `port.unwrap_or(993)`）。

### 3.3 `.ok()` 13 → ≤3

```rust
// 现在
let _ = conn.logout().ok();     // 连"到底有没有登出成功"都不知道

// 之后
if let Err(e) = conn.logout().await { tracing::debug!(?e, "logout 失败（不影响结果）"); }
```

### 3.4 重复的参数校验 → 一次 `MailConfig::validate()`

现在 `host`/`port`/`password` 的检查散落在 `connect`、`probe`、`sync_headers`、`fetch_body` 等多处，
但真正需要它的只有**建立连接之前**一次。

```rust
impl MailConfig {
    pub fn validate(&self) -> Result<(), AppError> { /* host 非空、port 1..=65535、password 非空 */ }
}
// connect() 第一行：self.validate()?;
```

### 3.5 日志 → 一处

`eprintln!` 4 处 + `println!` 若干 → 统一 `tracing`（或保留 `eprintln!` 但只留在 `lib.rs` 的启动点）。

---

## 4. 迁移步骤（每步独立可回滚，一步一个文件组）

| 步 | 内容 | 验证 | 状态 |
|---|---|---|---|
| **S0** | `lib.rs` 瘦身（`window.rs`）+ `mail.rs` → `mail/mod.rs`（不改一行逻辑） | `cargo check` | ✅ 已完成 |
| **S1** | `encoding/`（4 个文件）+ **补 19 个单测** | `cargo test --lib` | ✅ 已完成（34 测试全绿） |
| **S2** | `error.rs` + `model.rs`；`Result<_, String>` → `AppError`；命令层 `map_err` 只剩一次 | `cargo test` | 待做 |
| **S3** | `imap/`（6 个文件：mod / text / list / fetch / mutate，原样搬） | `cargo test` + 启动收信 | ✅ 已完成 |
| **S4** | `mime/`（`mime.rs` + `body.rs`）；`sync.rs` | 同上 | ✅ 已完成 |
| **S5** | `watch.rs`；`mail/mod.rs` 只留命令 + 测试 | 同上 + 新邮件通知 | ✅ 已完成（34 测试全绿） |
| **S6** | 防御性收敛：`AppError` 打通命令层与业务入口层；`MailConfig::validate()` 一处校验；`blocking` 放开错误类型 | 同上 | ✅ 已完成（34 测试全绿、0 warning） |

### 实际落地结构（已完成 S0–S5）

```
src-tauri/src/                     行数
├─ main.rs                            6   入口
├─ lib.rs                           124   插件 + 托盘 + 命令表
├─ window.rs                         22   show / toggle
├─ error.rs                          73   AppError（Auth/Network/Protocol/Parse/Unsupported/Io）
├─ attach/{mod,kind,text,pdf,docx}   154  附件文本抽取（PDF / docx / 纯文本）
└─ mail/
   ├─ mod.rs                        163   ← 只剩 8 个命令 + blocking
   ├─ tests.rs                      723   34 个单测（含 live_* 手动用例）
   ├─ model.rs                      127   DTO
   ├─ html.rs                       137   HTML → 纯文本
   ├─ encoding/{mod,word,mojibake,part}  246/138/67/48
   ├─ imap/{mod,text,list,fetch,mutate}  223/129/174/59/123
   ├─ mime.rs 172 · body.rs 52 · sync.rs 87 · watch.rs 160
```

生产代码最大文件 **246 行**，`mail/mod.rs` 从 2598 行降到 **163 行**。
全部 26 个 Rust 文件、`cargo test --lib` **34 通过 / 0 warning**。

每步硬性要求：

1. 只搬代码、或只做单一机械替换，**不在同一步里改行为**；
2. `cargo test --lib` + `cargo build` 必须绿，`cargo check` 无新增 warning；
3. 命令名 / 字段名 / 事件名（`mail://watch`）一个都不能变 → 前端零改动；
4. 完成后立刻提交，出问题 `git revert` 单步即可。

---

## 5. 测试策略

现有 13 个单测（UTF-7、RFC2047、`html_to_text`、mojibake 判定等）全部随 `encoding.rs`/`mime.rs` 迁移。
**S1 之前先补**这些纯函数用例（无需网络，最省事也最兜底）：

| 目标 | 用例 |
|---|---|
| `decode_mutf7` | `&AOk-` → `é`；`&U,BTFw-` → 中文；无 `&` 原样 |
| `decode_encoded_words` | `=?GBK?B?...?=`、`=?utf-8?Q?...?=`、混合多段、非法段原样保留 |
| `decode_q` | `=E4=B8=AD` → `中`；孤立 `=` 不 panic |
| `looks_like_mojibake` / `badness` | 已知乱码样本判 true；正常中文判 false |
| `html_to_text` | 去 script/style、`&nbsp;`、块级换行、超长不 panic |
| `parse_list_line` | Dovecot / 163 / QQ 三种 `* LIST` 形态 |
| `uid_set` | 连续段折叠 `1:3,5`、空数组报错 |

---

## 6. 命令契约（不得改动）

| 命令 | 入参 | 出参 |
|---|---|---|
| `mail_test_account` | `MailConfig` | `AccountProbe` |
| `mail_sync_headers` | `cfg, folder, days, limit, afterUid` | `HeaderBatch` |
| `mail_fetch_body` | `cfg, folder, uid` | `MailBody` |
| `mail_save_attachment` | `cfg, folder, uid, index, path` | `u64` |
| `mail_set_flags` | `cfg, folder, uids, seen?, flagged?` | `()` |
| `mail_move` | `cfg, folder, uids, target` | `u32` |
| `mail_watch_apply` | `specs` | `Vec<String>` |
| `mail_watch_stop` | — | `()` |

---

## 7. 附件功能（新增，与重构解耦）

### 7.1 需求

- **聊天**：能发 PDF / Word / 文本等，模型能看到文件内容（不是只存路径）；
- **知识库**：能导入 PDF/Word 成文档并进现有索引；
- 不支持的类型要**明确回报**，不要静默当空文件。

### 7.2 Rust 侧（新模块 `attach/`，不碰 mail）

```rust
#[tauri::command]
pub async fn attach_pick(filter: Option<Vec<String>>) -> Result<Vec<AttachMeta>, AppError>;
// → { path, name, ext, size, kind, supported }

#[tauri::command]
pub async fn attach_extract(path: String, max_chars: Option<usize>) -> Result<AttachText, AppError>;
// → { kind, text, chars, truncated, pages? }
```

| 类型 | 抽取方式 | 失败时 |
|---|---|---|
| `txt/md/csv/json/log` | 直读 + **编码识别**（UTF-8 → GB18030 回退） | `Parse("无法识别编码")` |
| `pdf` | `pdf-extract` | 无文本层（扫描件）→ `Parse("这是扫描件，暂时只能读取图片版")` |
| `docx` | `zip` 读 `word/document.xml` → 抽 `<w:t>` | `Parse("docx 已加密或损坏")` |
| 其它 | — | `Unsupported("暂不支持 .x 类型")` |

新增依赖：`pdf-extract = "0.7"`、`zip = "2"`（`encoding_rs` Cargo.toml 里已有，直接复用）。
上限：单文件 10 MB、抽取 200,000 字符（超出截断并标记 `truncated`）。

### 7.3 前端落点

| 位置 | 改动 |
|---|---|
| `shell/chat/components/Composer.tsx` | 加 📎：选文件 → `attach_extract` → 作为消息的一部分发送（`part.type = "file"`），气泡里折叠显示"📄 简历.pdf · 8.4k 字" |
| `kernel/agent/runtime.ts` | 组装 messages 时把 file part 的文本拼进上下文（带 `[文件: 名称]` 前缀，超长截断） |
| `modules/knowledge/components/KbView.tsx` | 加"导入文件"：选 PDF/Word → 抽取 → 写成知识库里的 `.md`（附原文路径）→ 触发一次增量索引 |
| `modules/knowledge/ingest.ts` | 已支持 md 扫描，无需改 |

### 7.4 顺序建议

`attach` 是**纯新增**（新目录 + 新命令 + 前端一个按钮），可以插在 Rust 重构的任意两步之间做；
建议放在 **S2 之后**（那时已有 `AppError`，新模块直接复用，不用再写一套字符串错误）。

---

## 8. 顺带要清理的小事

1. `Cargo.toml` 第 37~41 行有两段重复的 mail 注释（一次改注释留下的），合并成一段；
2. `mail.rs` 顶部的长注释（为什么自己写 IMAP）迁移到 `mail/mod.rs` 文档注释；
3. `lib.rs` 里 `show_window/toggle_window` 移到 `window.rs`（约 40 行），`lib.rs` 只留装配。
