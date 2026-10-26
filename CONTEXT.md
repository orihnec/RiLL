# RiliAgent — 项目上下文（压缩版）

> 用途：任何新会话 / 新 agent 快速恢复现场。
> 状态：**M1 ✅ · M2 ✅ · 多会话 ✅ · 多 API ✅ · M3 RAG+知识库 ✅ · M4 自迭代 ✅（构建验证，待真机验收）**。
> 最后更新：2026-08。

---

## 1. 产品

个人效率桌面工具：Notion Calendar 式日历 + AI Agent（Cmd+K 核心入口）+ RAG 个人知识库（本地 Markdown）。

**硬约束**：纯本地（无服务器端，Rust 只当壳）；LLM 走 OpenAI 兼容 API（baseURL 可配置，已用 DeepSeek `deepseek-v4-flash` 真机验证）；数据源仅本地日程 + 本地 Markdown；内核稳定、功能模块化（新增功能 = 新增模块目录，内核零改动）。

## 2. 已拍板的设计决策（勿再翻案）

| 领域 | 决策 |
|---|---|
| 重复事件 | 完整 RRULE（每日/每周/每月/每年 + 间隔 + COUNT/UNTIL）；单实例例外（override + EXDATE）；**"此及以后"拆分系列不做** |
| 视图 | M1 含完整月视图；月视图交互最小化（点击编辑/拖拽换日） |
| embedding | 与 chat 同供应商、模型可配；失败自动降级纯 FTS5（M3 用） |
| 自迭代 | 手动为主：确认后常驻；超 90 天无信号且未确认 → 自动归档（M4） |
| API key | tauri-plugin-keyring（Windows 凭据管理器），`service=com.riliagent.app / user=llm-api-key` |
| 冲突/时区 | 允许重叠；unix ms 按本机时区解释，单时区 |
| 类别 | 固定 8 色低饱和渐变（`src/lib/colors.ts`） |
| 混合检索 | RRF 合并向量+FTS5，top-k 8（M3） |
| 知识库监听 | 30s 轮询 + 手动"立即索引"（M3） |
| 反思触发 | 累计 via_agent diff ≥ 20 条 或 手动（M4） |
| Agent 确认 | create 直行；update/delete 先文本复述等确认（prompt 约束 + 多轮对话） |
| CORS | LLM 请求走 **tauri-plugin-http**（fetch 注入 provider）；capabilities 已配 `https://*` + `http://*` 作用域 |
| 会话 | **多会话**：chat_sessions 分组、历史/搜索/回退/切换/新建/删除 |

## 3. 架构与维护铁律

```
src/kernel/        # 内核：db.ts（迁移调度·稳定id寻址）/ module.ts（加载器）
│                  #   agent/{types,registry,mock,prompts,runtime}.ts · chat.ts（会话CRUD/搜索/回退）· commands.ts
src/modules/       # calendar（schema/service/recurrence/tools/components）· knowledge（骨架）
src/modules.ts     # ★ 全应用唯一模块清单
src/shell/         # App.tsx（布局）· workbench.ts（★ 工作台/面板注册表）· commands.ts（Cmd+K）
│                  #   TopBar / Sidebar / MiniMonth / AppOverlays / hooks（快捷键·关闭请求·月历圆点）
│                  #   SettingsDialog / ThemePanel / CommandPalette / ChatDock（双视图）
src/stores/        # calendarStore / settingsStore / chatStore（多会话）/ uiStore / kbStore
src/lib/           # time.ts · colors.ts · themes.ts · utils.ts · error.ts（errMsg）
```

铁律：① components 只渲染，数据来自 store；② 所有 SQL 只在 schema.sql 与迁移文件中；③ 新增 Agent 能力 = 模块 tools.ts 加一个工具对象。④ **模块迁移也可以带 `skipIf`**（`migrations: [sql, { sql, skipIf }]`，ALTER 加列必须用这种写法，见 scout:2）。⑤ **新增页面/弹层/命令只改 `shell/workbench.ts`**：顶部视图组、右键菜单、侧边栏、Cmd+K 全部由注册表派生，别在组件里手写入口（详见 `docs/DEV-GUIDE.md`）。

## 4. 进度（21 个提交，最新在前）

### M1 ✅ 验收（`cda082e`→`e6a627b`，9 提交）
脚手架 / 内核加载器 / SQLite / 周视图（拖拽+resize+重叠分栏+当前时间线）/ 月视图 / MiniMonth / RRULE 全套（含单实例例外）/ 打磨打包（MSI+NSIS）/ 4 个交互修复（点击穿透、跨天拖拽、下拉透明、拖拽幽灵 Portal）。

### M2 ✅ 真机联调通过（`6868450`→`aef8526`，8 提交）
- LLM 配置持久化（`app_settings`，kernel:1）+ keyring 存 key + **设置页"测试连接并获取模型"**（模型列表点选立即保存）
- Agent 运行时：**ai@7 streamText 纯客户端**（v7 useChat 是服务端 transport 架构，不可用）+ stopWhen 多步循环 + tauri-plugin-http 绕 CORS + prompts 组装
- calendar 5 工具（zod schema）；findFreeSlots；对话面板（流式+工具状态卡片+停止+思考中气泡）；Cmd+K（注册表+全局快捷键）；mock/真实双路径
- **DeepSeek thinking 兼容**：reasoning 全链路（见地雷 14/15）；流式失败自动降级 generateText；30s timeout
- 用户实测通过：真实 API 建日程、工具循环、多轮对话

### 多会话增强 ✅（`d62dc88`）
`chat_sessions` 表（kernel:3，default 存量自动收编）；聊天面板**双视图**（当前对话/历史记录）；历史列表（标题=首条消息、消息数、相对时间、当前标记）；**关键词搜索回忆**（instr 子串，点击直达消息）；会话切换/新建/删除（两步确认）；**消息级回退**（悬停"回退到此"→ 确认 → 删除其后全部消息，DB 同步）。

### 聊天附件 ✅（kernel:7）
- 输入胶囊「+」按钮（DSH 附件位）→ 文件选择（多选）→ 解析为文本：**Excel(.xlsx/.xls → 首个工作表转"列: 值"表格，≤500 行/30k 字符，SheetJS 动态分包 429KB)、Word(.docx → mammoth 动态分包 500KB)、文本类(.txt/.md/.csv/.json/.log/.yaml 直接读)**；图片/PDF 明确不支持（友好报错）；xlsx/mammoth 均懒加载不进首屏
- 附件随消息落库（`chat_messages.attachments_json`，kernel:7 skipIf 迁移）；AI 上下文完整可见（toCoreMessages 拼 `[附件：名]` + 内容），UI 只显示文件名 chip（气泡上方 + 输入区可移除）；空文本 + 附件也可发送
- jobs 工具引导：jobs_create/jobs_update description 提示缺链接时先 `web_search` 搜官网/职位页补 url（找不到留空不编造）

### mail 模块 ✅ M1（邮箱 · IMAP 读信 + 邮件本地化）
- **为什么动 Rust（且不用现成 imap crate）**：IMAP 是 TCP+TLS，webview 的 JS 碰不到。**实测发现 `imap 2.4.1` 有 panic 级 bug**：它底层的 `imap-proto 0.10` 解析不了 163 的 `* ID (...)` 响应，解析失败后**不把后续 `a2 OK` 读干净** → 下一条命令标签错位 → 它内部用 `assert_eq!` 判定标签 → **直接 panic**（在 Tauri 里等于把应用带崩）。所以改成用 `native-tls` **自己走 IMAP 协议**（`src-tauri/src/mail.rs`，约 700 行）：问候/LOGIN/ID/LIST/SELECT/UID SEARCH/UID FETCH/LOGOUT，含 `{N}` 字面量字节精确读取、modified UTF-7 解码、响应解析；MIME 仍交给 `mail-parser`。依赖只剩 `native-tls` + `mail-parser` + `base64`（`imap` 已从 Cargo.toml 移除，`imap-proto` 的未来兼容告警随之消失）。
- **踩过的坑（都写进了 mail.rs 顶部注释）**：① **网易系（163/126/yeah/188）必须在 SELECT 前发 ID**，否则 `NO SELECT Unsafe Login`（实测：不发 ID 时 LIST 正常、SELECT 报错）；② 文件夹名是 **modified UTF-7**（`&XfJT0ZAB-` = 已发送），crate 不带解码 → 自己实现，**第一版把字面 `&`（`&-`）吃掉，被单测抓到**；③ 特殊文件夹**优先用服务器给的 `\Sent/\Drafts/\Trash/\Junk` 属性**，其次才按名字猜；④ IMAP 日期是 `28-Sep-2026`（英文月缩写）自己算；⑤ 授权码里可能有 `"`/`\`，LOGIN 前必须转义；⑥ 读超时 30s，避免服务器卡死时永久转圈；⑦ **纯 HTML 邮件要自己剥标签**（`html_to_text`），否则 `text` 字段会是一整段 `<!DOCTYPE html>`（实测 9060 字 HTML → 474 字可读文本），搜索和后续 AI 提取都会被污染。
- **真机验证**：`live_imap_smoke` 是**可选的真机冒烟测试**（不给环境变量就跳过），走的就是应用同一套代码。163 实测结果：7 个文件夹全部正确解码（收件箱/草稿箱/已发送/已删除/垃圾邮件/病毒文件夹/广告邮件）、收件箱 42 封 UIDVALIDITY=1、邮件头（发件人/主题/时间/大小）解析正确、正文与附件元数据正确。跑法：
  ```powershell
  $env:MAIL_TEST_USER="you@163.com"; $env:MAIL_TEST_PASS="授权码"; cargo test --lib live_imap -- --nocapture
  ```
- **新邮件提醒 ✅（`modules/mail/notify.ts`）**：应用运行期间（含最小化到托盘）每 **60s tick**，对"启用 + 开了提醒 + 到点"的账号（`notify` / `notify_interval` 两列，mail:1 迁移，默认开/15 分钟）做**增量同步收件箱**，**真有新邮件才发 Windows 通知**（复用日程提醒那条 `tauri-plugin-notification` 通道）；点通知直接打开邮箱面板（`onAction`）。要点：① **首次同步不提醒**（那是把历史邮件一次性拉下来）；② 通知条数用"真新增"，见下面的计数修正；③ 单个账号失败不影响其它账号，错误落到 `last_error` 与账号卡上的红点；④ WebView2 后台会节流定时器（最小 1 分钟粒度），所以间隔按分钟计。UI：账号卡上一个**铃铛按钮**一键开关、编辑弹窗里可选间隔（5/10/15/30/60 分钟）、侧边栏「邮箱」入口带**未读角标**（`totalUnread()` 汇总启用账号的收件箱未读，停用账号不计入）。
- **顺手修掉一个会误报的 bug**：`upsertHeaders` 原先返回的是"本次拉了多少封"而不是**真新增**，于是重复同步会一直显示"新增 200 封"、新邮件提醒也会每次都弹。现改为先分块 `SELECT uid ... IN (...)` 查已存在，返回 `{added, updated}`；`syncFolder` 用它做"新增 N 封 / 已是最新"的判断与通知条件。
- **会话（线索）合并 ✅ 后端（`modules/mail/threading.ts` + mail:2 迁移）**：用户明确要的"像聊天一样把同一会话的邮件合在一起"。算法用的是 **JWZ / Jamie Zawinski 邮件线索算法**（Thunderbird 等主流客户端同款，[jwz-go 文档](https://pkg.go.dev/github.com/floatpane/jwz-go@v0.0.1)有完整步骤）：① `References` 相邻两两连父子；② 父优先 `In-Reply-To`、否则 `References` 末项；③ **根按规范化主题合并**（反复剥 `Re:/Fwd:/AW:/SV:/Odp:/Antw:` 等多语言前缀 + 列表标签 `[xxx]` + 压空白 + 小写）兜住转发与丢 References 的客户端；④ 会话按最新一封倒序、会话内按时间正序（读起来像聊天记录）。`thread_id` 取**会话最早一封的 message-id**（跨次重算稳定，不会因为来了新邮件就换 id）。
  - **实测踩到的关键坑**：同主题合并若只判断"参与者有交集"，因为**每封都包含我自己**，会把不同公司的「面试通知」全糊成一条。必须**排除本邮箱自己的地址**，并且：企业域允许"同域名算同一方"（同公司换个人发信也算同一会话）、公共邮箱域（gmail/163/qq/outlook…）不适用域名规则、再加 30 天时间窗。
  - **落库方式**：只在 `mail_messages` 加 `thread_id` / `references_json` / `in_reply_to` 三列（mail:2 迁移）；**不建 threads 表**——会话列表直接用 SQL `GROUP BY thread_id` 聚合（条数/未读数/参与者/最新摘要），永远与邮件一致、无需二次同步。每次同步完新邮件后 `recomputeThreads(folderId)` 整文件夹重算（纯函数，绝不产生孤儿线程），只 UPDATE 变化的行。
  - **列表/检索**：`listThreads()` 一行一会话、任意一封命中关键词即返回该会话（计数仍按整会话算）；`listThreadMessages(threadId)` 取会话内全部邮件（时间正序）供聊天式渲染。
- **UI（M2 重写，三栏 + 会话聊天视图）**：侧边栏「邮箱」→ 浮层 `MailDock`（独立分包 ~37KB）。
  - **左栏**：**账号（可折叠）+ 文件夹树**，未读徽标、悬停出现同步按钮、右键账号菜单（同步 / 开关提醒 / 编辑 / 删除）；双击文件夹 = 只同步该文件夹。**不再把文件夹做成一排 chips**（企业邮箱几十个文件夹会爆）。
  - **中栏**：**会话列表**（一行一个会话，不再是"一封一行"）—— 未读圆点 + 发件人头像 + 参与人数 + 最新时间 + 星标 + **会话封数徽标** + 摘要；**滚动到底自动加载下一页**（不再用页码按钮）；右键会话 = 标记已读/未读、加/取消星标、移动到…、删除会话。
  - **右栏**：**会话内邮件按时间从上到下堆叠**（像聊天记录），每封一张卡（头像/发件人/收件人/时间/大小、正文、附件另存、正文里的链接列表）；HTML 正文默认**折叠到 360px + 「展开全文」**；打开会话即标记已读（工具栏可「标记未读」还原）。
  - 顶部只留 搜索 / 未读筛选 / **补正文** / 全部同步 / 添加邮箱 / 关闭；搜索是**会话级**的（会话内任一封命中整条会话都返回，计数仍按整会话算）。
- **写操作（M2）**：Rust 侧新增 `mail_set_flags`（`UID STORE ±FLAGS.SILENT (\Seen|\Flagged)`）与 `mail_move`（`UID COPY` → 源标记 `\Deleted` → **优先 `UID EXPUNGE`**，不支持则退回 `EXPUNGE`）；JS 侧 `setFlagsRemote`/`moveRemote` 成功后必须回写本地（`applyFlagsLocal` / `removeMessagesLocal`），否则列表与服务器状态会不一致。删除 = 移动到垃圾箱文件夹（已在垃圾箱则就地清理）。
- **正文懒加载 + 预取**：正文只在打开时下载并永久缓存（`body_fetched_at`）；同步完每个文件夹会**后台预取 6 封**正文，顶部「补正文 N」按钮可批量补 20 封（列表摘要、会话内搜索、后续 AI 提取都要正文）。`saveMessageBody` 会顺带把 `preview` 填上（列表摘要来源）。
- **血泪教训：会话必须"自愈"，不能只在同步时算 ✅（已修）**。线上出现的故障是：邮箱面板显示"63 个会话"，点进去**右栏一片空白**。根因有两个，都是我的 bug：
  1. **老数据从未线程化**：那批邮件是 M1 版本同步的（当时 `thread_id` 列还不存在），而 M2 的同步把重算写成了 `if (batch.headers.length > 0) await recomputeThreads(...)` —— 没有新邮件时直接跳过，于是 `thread_id` **永远是 NULL**。列表用 `COALESCE(thread_id, 'row:'||id)` 兜底，就把**每封邮件当成一个独立会话**（界面上"63 个会话"其实是 63 封邮件，所以每行都写"等 2 人"——这是最能识别该故障的现象）。上线库副本实测：QQ 收件箱 63 封 → 真会话 **0** 个。
  2. **合成 id 查不回来**：点击时传给 `listThreadMessages` 的是合成 id `row:<uuid>`，而查询只匹配 `thread_id = ? OR id = ?` → 匹配不上 → 返回空 → **右栏全白**。
  **三处修复**：① `syncFolder` 里**每次同步都重算**（纯函数、只 UPDATE 变化的行，代价可接受）；② `listThreadMessages` 反解 `row:<id>` 前缀（`threadIdOfMessage` 也可按本地邮件 id 找回会话）；③ **打开面板即自愈** `healThreads()`（扫 `thread_id IS NULL` 的文件夹补算，`schema-v4.sql` 加了 `WHERE thread_id IS NULL` 的**部分索引**让这个扫描是常数级；自愈后若调过顺序会 `flash` 提示并重载列表）。UI 还加了兜底：右栏若真的取不到邮件，显示「重算会话并重新打开」按钮。
  - **同一故障的准确率问题**：M1 时期入库的邮件 `references_json` 是空的，只能靠"主题 + 参与者"兜底合并（准确率低于真正的线索链）。因此加了「**重建会话**」按钮 = 重新拉一遍邮件头（补 References/In-Reply-To）再重算；另有不联网的「整理会话」。线上副本实测自愈后：QQ 收件箱 63 封 → 56 个会话（合并出 5 条多封线索），163 收件箱 88 封本来就是 88 个真会话（16 条多封线索）。
- **AI 排程 ✅ M3（`modules/mail/extract.ts` + `components/ScheduleDialog.tsx` + `tools.ts`）**：从邮件里识别「面试 / 笔试测评 / 宣讲会 / 投递截止 / offer 沟通」→ **待确认候选** → 用户点确认才写日历。用户拍板的铁律：**绝不自动排程**。
  - **两个入口**：① 文件夹工具栏「**AI 扫描**」= 扫最近未分析过且已缓存正文的邮件（先弹成本确认条：将发送 N 封 / 约 M 千字，用户点了才真发）；② 会话工具栏「**AI 识别**」= 只分析这一场会话（正文没缓存会先自动取）。识别完自动打开候选面板（工具栏也有「待确认 N」按钮）。
  - **候选卡片**：类型徽标 + 标题 + 时间（可**改时间/改全天**后再确认）+ 公司/岗位/地点/联系人/会议链接 + **置信度**（≥85% 绿 / ≥60% 黄 / 其余红）+ **依据原句**（照抄邮件原文，便于核对模型有没有理解错）+ 来源邮件。操作：确认并写入日历 / 改时间 / 忽略；已确认的可**撤销**（连带删掉写进日历的日程）；「确认全部高置信度（≥85%）」是一次显式点击。
  - **成本与可靠性**：闸门 `MAX_MESSAGES_PER_SCAN=50`、`MAX_CHARS_PER_EMAIL=20000`；落库后打 `mail_messages.ai_analyzed_at`，**没抽出内容的也算分析过**（避免反复烧 token）；未配置模型时直接抛错并指引去设置里填，不静默失败。
  - **解析健壮性**（`parseCandidates`，纯函数已测）：兼容纯 JSON、```json 代码块、前后带解释文字、单个对象、`{candidates:[...]}` 包一层；`normalizeCandidate` 会**丢弃没有确定时间的候选**（"另行通知/待定"这类排不了程）、`confidence` 0-100 自动归一、未知类型归 other、非法分类回落 important、只有日期按全天。
  - **相对时间**：提示词要求以**该封邮件的收到时间**为锚点解析（不是以今天），并要求在 evidence 里给出原句 —— 邮件是几天前的，"下周三"必须按那天的下周三算。
  - **幂等（踩过）**：`confirmExtraction` 重复调用**只对应一个日程** —— 已确认且没改内容直接返回原 event id；改了时间/标题则 `updateEvent` **移动原日程**而不是新建（否则智能体重试或用户连点会写出重复日程）。
  - **事件备注**带上依据原句/地点/会议链接/联系人/公司岗位/来源邮件，以后回查"这条日程是怎么来的"能直接看到出处。
  - **Agent 工具（6 个）**：`mail_schedule_scan`（只读识别，返回候选）、`mail_schedule_list`、`mail_schedule_confirm`（**描述里明确要求先复述时间/公司/岗位并得到用户同意再调用**）、`mail_schedule_ignore`、`mail_find_threads`（按公司/岗位找会话）、`mail_thread_read`（读会话全文 + 顺带识别安排）。提示词第 7 条约束邮箱场景"不要去网上搜"。工具总数因此到 **32 个**（原设计注释写的是 <30，已把注释改成实际预算：>~40 才需要做路由）。
- **中文邮件乱码（GBK）根治 ✅ —— 这是本项目最深的一个坑**。现象：51job/平安/银行/国企的邮件正文和主题全是 `��лӦƸũ��ɽȪ`、`У԰Ƶ��` 这种"看着像西里尔字母"的乱码。
  - **机制（算清楚了）**：这些邮件用 **GBK/GB2312 但没声明 charset**（或声明成 utf-8）。GBK 的双字节经常**恰好是合法 UTF-8**：「校」的 GBK `D0 A3` 正是 UTF-8 的 `У`(U+0423)；「感谢应聘」= `B8 D0 D0 BB D3 A6 C6 B8` → 按 UTF-8 解 = `��лӦƸ`（`B8 D0` 非法→`��`，`D0 BB`→`л`，`D3 A6`→`Ӧ`，`C6 B8`→`Ƹ`）—— 与库里的字节**完全对上**。
  - **修法（`src-tauri/src/mail.rs`）**：不再信任何现成解码，四层：
    1. **从原始报文按 `MessagePart::offset_body/offset_end` 切出真正的原始字节** —— 关键！`part.contents()` 返回的是 mail-parser 按（错的）字符集**有损转码**后的 UTF-8 字节，无效序列已变成 U+FFFD，再想用 GB18030 救只能得到「锟斤拷」（U+FFFD 的 UTF-8 字节 `EF BF BD` 被当 GBK 读）。
    2. **自己做传输编码解码**（`mail_parser::decoders::{base64,quoted_printable}` 是公开的）。
    3. **字符集按"像不像乱码"逐层回退**：声明的 → UTF-8 → GB18030 → windows-1252。判据 `looks_like_mojibake`：出现 U+FFFD，或**有西里尔/国际音标/亚美尼亚字母却一个汉字都没有**。真正的中文（"中文测试"）与西欧文本（"été"）都不满足，所以不会被改坏；已知取舍：真·俄语邮件会被当 GBK（本场景无所谓）。
    4. **RFC2047 编码字自己解**：mail-parser 把 `=?gb2312?B?…?=` 也按 UTF-8 解成乱码，不能信它。自己解 B/Q 两种编码 + `encoding_rs::Encoding::for_label`（支持 gb2312/gbk/gb18030/big5）。**踩到的子坑**：找编码字结束标记不能直接找第一个 `?=` —— Q 编码的 payload 常**以 `=` 开头**（`=?gb2312?Q?=D0=A3=…?=`），分隔符的 `?` 加 payload 首个 `=` 会被误判成结束 → 必须**结构化解析**（charset 到第一个 `?`、编码方式 1 个字符、再在 payload 内部找 `?=`）。折行续行展开时只能补**一个**空格（`raw_header_value`）。
  - **已存进库的坏正文**：U+FFFD 已经丢字节，**只能重新下载**。所以加了「修复正文 N」按钮（`repairBodies`，JS 侧 `looksLikeMojibake` 用同一套指纹判定，分批 10 封/次）+ 在面板上显示待修复数量；主题也一并被修好（`saveMessageBody` 会用重新解析出的主题回写）。
  - **验证**：Rust 13 个测试（含无 charset 的 GBK 8bit 正文、base64+GBK 正文与 RFC2047 主题、Q 编码 gb2312 主题、折行头、`&`/西欧/ASCII 不被改坏、端到端 `parses_gbk_message_into_readable_chinese`）；163 真机回归无异常。
- **阅读体验 ✅（二级阅读界面）**：会话流里的正文只给**折叠预览**（约 300px，`scrolling="no"` 不出现内层滚动条，超出部分加渐变遮罩 + 「阅读全文」），完整正文去**二级阅读界面** `MessageReader.tsx`：90vh 全屏、自动撑高、**← →（或左右方向键）切换同一会话的其它邮件**、显示图片开关、附件另存、链接列表。双击会话里的邮件卡片也能打开。
  - **邮件 iframe 渲染治理**：注入的 CSS 里**不要**给 body 设 background/color（我的 `<style>` 追加在邮件样式之后，同优先级会覆盖邮件配色 → 深色底邮件被刷白而文字还是浅色）。画布底色交给 **iframe 元素**（永远白色 + `colorScheme: light`，与应用的深/浅主题无关）。同时 `overflow-x:hidden` + `*{max-width:100%!important}` + `table/img{max-width:100%!important}` 把邮件按 600px 固定宽的排版压回容器内，**消灭横向滚动条**。
- **实时接收 ✅（Rust 常驻长连接，`mail.rs` 的 `mail_watch_apply/stop` + `watch.ts`）**。用户要"实时收到"。结论与做法：
  - **探针实测：163/Coremail 不支持 IDLE**（`CAPABILITY` 里没有 IDLE，发 `IDLE` 直接 `BAD command not support`；它只有 `XAPPLEPUSHSERVICE`，那是给苹果 Mail 的，要苹果推送证书，用不了）。**但 `STATUS INBOX (MESSAGES UNSEEN)` 只要 ~21ms**（不 SELECT、不拉邮件头），所以"准实时"完全可行。顺带确认：`UIDPLUS` ✓（`UID EXPUNGE` 可用）、`ID` ✓、`LITERAL+` ✓；**163 不支持 `UIDNEXT`**（返回空）。
  - **为什么监听必须在 Rust 里**：WebView2 会把窗口隐藏时的 JS 定时器**节流到 1 分钟粒度** —— 原来的 60s tick 就是因此做不到准实时。改成 Rust 常驻线程（真 sleep、不受节流），并且**维持长连接**（不必每次重连 TLS+登录，也避免撞服务端登录频率限制）。
  - **两种模式自动选**（`CAPABILITY` 里有 IDLE 就走推送）：IDLE 支持 → 服务器主动推 `EXISTS/RECENT`（QQ/Gmail）；不支持 → 每 `watch_interval` 秒（默认 **20 秒**，可设 10/20/30/60/120）查一次 `STATUS`。**实测端到端**：真用 SMTP 给自己发一封信，**5.13 秒**后监听线程报 `changed 42 → 43 封`（那时测试间隔是 5 秒）。
  - **工程细节**：每账号一个命名的后台线程 + `AtomicBool` 停止位（`interruptible_sleep` 每 200ms 检查，退出要快）；**断线指数退避重连**（5s→10s→20s→40s→60s），**连续失败 5 次就停**并把原因发给界面（避免把服务端惹毛 / 授权码失效时死循环）；`mail_watch_apply` 是**幂等对账**（比对 host/port/security/username/folder/interval 签名，配置没变就不重连）；事件经 `mail://watch` 推给前端，前端**去抖 2 秒 + 同账号串行**再增量同步，避免一次来几封就同步几次。
  - **事件出口做成可注入**（`WatchSink = Arc<dyn Fn(WatchEvent)>`）—— 生产是 Tauri `emit`，测试里收集到 `Vec` 断言，所以这条链路能被无头测试覆盖。
  - **顺手把 SMTP 跑通了**（测试里）：`smtp.163.com:465` 隐式 TLS + `AUTH LOGIN`（base64）+ DATA，用同一授权码。以后做"写邮件/回复"直接用。
  - **UI**：账号行右侧一个状态点（绿=已连、黄=异常、红=已停、灰=启动中），悬停显示"服务器推送（IDLE）"/"每 N 秒查询一次"与错误原因；标题栏显示"实时接收 已连 N/M（IDLE 推送｜快速查询）"；账号右键菜单有「重启实时接收」。账号编辑弹窗里改成「实时接收新邮件」开关 + 秒级间隔。
- **数据/凭据**：`mail_accounts` / `mail_folders` / `mail_messages` / `mail_extractions` 四张表；**授权码只进 Windows 凭据管理器**（`mail:{accountId}`，与 LLM key 同待遇，绝不入库）；删除账号连本地邮件与钥匙串一起清。
- **同步策略**：每文件夹 `last_uid` 游标（`uid_validity` 变了 → 判定服务器重置 UID → 清空该文件夹重来）；首次按账号 `sync_days`（默认 30 天）回溯、`sync_limit`（默认 200 封）封顶；**邮件头先落库，正文打开时才拉取并缓存**（懒加载、离线可看）。列表预览（`preview`）在 M1 里为空（只拉头，不拉正文），M2 补。
- **UI（旧版，已被上面的 M2 三栏会话视图取代）**：~~三栏浮层；中栏文件夹 chips + 分页列表；右栏单封详情~~。留作对照：当时的问题正是"文件夹做成 chips"（文件夹多会爆）、"一封一行没有会话概念"（面试往来散成多条）、翻页按钮、以及右上角一个灰的 M3 占位按钮 —— 用户评价"一大股异味"，据此重写成上面的三栏 + 会话聊天视图。
- **邮件 HTML 安全（邮件是不受信输入，而渲染环境能调 Tauri IPC）**：两层防御 —— ① `sanitize.ts` 用 DOMParser 走真实 DOM，整棵删 `script/iframe/object/embed/form/base/meta/link/svg/math/input/button`、剥 `on*` 与 `javascript:`、清 `@import`/`expression()` 样式；② 渲染进 `<iframe sandbox="allow-same-origin">`，**不给 allow-scripts**（脚本一律不执行；保留 same-origin 只为读 scrollHeight 自适应高度）。**远程图片默认不加载**（防追踪像素），可点「显示图片」放行；正文链接不靠 iframe 点击，统一抽成下方列表用系统浏览器打开。注意：纯文本链接提取的正则**必须排除中文标点**（`，。；：、！？（）《》`），否则 `https://a.com/x，或看` 会被当成一个链接。
- **里程碑**：**M1 能连能看**（本次）；**M2** 已读/星标/删除/移动（需 IMAP STORE/COPY）+ FTS5 全文；**M3** AI 识别面试/笔试 → 待确认卡片 → 写日历（联动求职看板）+ `mail_*` Agent 工具。用户已拍板：IMAP 授权码 · **必须人工确认才排程** · 完整正文发给模型 · 侧边栏入口 · 邮件正常保存（正文入库）。

### 主题与风格 ✅（`lib/themes.ts` + `stores/themeStore.ts` + `app/ThemePanel.tsx` + `modules/theme/`）
- **字号大小**：右上角面板原「圆角」位置改为「字号大小」，小/中/大对应 100%/120%/150%（2026-10-26 调整），默认中。`ui_theme.fontSize` 持久化，旧配置自动补中；`--font-scale` 只缩放文字，标准 Tailwind 字号与 `text-ui-*` 都接入。新增字号类要同步 `lib/utils.ts` 的 tailwind-merge 配置；不要再写固定 `text-[Npx]`。CodeMirror 用主题扩展，邮件 iframe 由 `useMailFrame` 按原字号缩放并观察高度，主窗口/悬浮窗用 `riliagent:theme-changed` 事件即时同步。原圆角配置保留兼容，面板不再展示。
- **入口**：TopBar 调色盘按钮 → Popover 面板（点一下**立即生效**）；Cmd+K `app.openTheme`；**智能体**：`theme_get` / `theme_set`（见下）。悬浮窗（overview）是独立 webview，窗口获得焦点时重读主题保持一致。
- **换色原理（两个 Tailwind v4 变量钩子，勿改回逐个类名硬编码）**：
  ① `--color-indigo-*`：`bg-indigo-400/15`、`text-indigo-300` 等编译成 `color-mix(in oklab, var(--color-indigo-400) …)` → 覆盖这一条色阶即全站 120+ 处强调色一次换掉。
  ② **`--color-white`**：全站的"表面叠加"（`bg-white/3`、`border-white/8`、`hover:bg-white/8`…）同样编译成 `color-mix(in oklab, var(--color-white) N%, transparent)` → **深色系它是白（提亮），浅色系换成墨色 `#0f172a` 就变"压暗"**。这是浅色主题能成立的关键，否则上百处 `bg-white/N` 在浅底上会直接消失。
- **基调（深色系/浅色系）**：由背景预设自带 `mode` 决定（自定义底色按相对亮度自动判定）。两套模式令牌在 `MODE_TOKENS` 里成对维护：`--foreground/--card/--popover/--muted/--border/--input/--secondary/--primary-foreground/--destructive/--color-white/--glass-*/--code-bg/--scroll-thumb/--sticky-head/--overlay`。**色阶亮度梯子也要反过来**（深色 94→55%，浅色 34→66%）：深色系 `text-indigo-300` 是亮色文字，浅色系必须变暗才看得清。
- **主题色**：10 种预设（OCLCH 色相角参数化）+ **任意十六进制自定义**（`hexToOklch()` 取色相与饱和度，`chromaScale = clamp(c/0.16, 0.3, 1.4)`，灰阶被抬到下限不至于无色）。石墨预设额外降饱和。
- **背景**：深色系 6 种（环境光/纯深色/深海/森夜/暖夜/紫夜）+ 浅色系 4 种（米白/晨雾/天青/薄荷）+ **自定义底色**；「环境光」与自定义底色的光晕**跟随主题色**（`--glow-a/b/c`），其余用自带渐变。
- **圆角**：紧凑 8 / 标准 14 / 圆润 20，改 `--radius` 即可 —— `@theme inline` 里补了 `--radius-2xl: calc(var(--radius) + 2px)` 与 `--radius-3xl: calc(var(--radius) + 10px)`（默认值与 Tailwind 原值一致）。
- **类别/状态色必须跟着基调走（踩过的坑）**：`lib/colors.ts` 的 `deriveCategoryColors()` 原先写死"文字 = 基色向白色混 78%"，这在深色系没问题，**浅色系直接白底白字（实测对比度 1.04:1，完全看不见）**——症状是日程卡片和被"求职监控"状态胶囊里的文字消失。现改为全部走 `color-mix` + 主题变量：`text = color-mix(in oklab, <基色> var(--tint-text), var(--color-white))`、`from/to = color-mix(in oklab, <基色> var(--tint-from/to), transparent)`；`--tint-text` 深色系 22% / 浅色系 45%，`--tint-from` 18%/30%，`--tint-to` 6%/12%（**45% 是实测下限**：50% 时琥珀色只有 4.34:1 不达标，45% 最差 5.0:1）。`bar` 仍是纯 hex（调用方要拼 `${bar}55`）。改这里务必重跑对比度校验（见下）。
- **顺带修掉的硬编码深色**（不改会在浅色系下变瞎）：`.glass`→玻璃令牌、滚动条→`--scroll-thumb`、对话框遮罩→`--overlay`、markdown 代码块→`--code-bg`、JobsBoard 表头→`--sticky-head`、TitleBar→`bg-background/85`、WeekView 空状态提示→`bg-popover/85`、JobsBoard 状态 chip 内联色→`color-mix(var(--color-white) …)`、EventCard 缩放手柄→`color-mix(var(--color-white) 35%, transparent)`，并新增 `--destructive-foreground`（深色系深字/浅色系白字）。
- **持久化**：`app_settings` key=`ui_theme`（JSON，含 `accentHex`/`backgroundHex`）；老配置（无 hex 字段）自动补齐，脏数据/非法 id/损坏 JSON/表缺失一律回落默认主题且不抛错。启动时在 `useSettingsStore.load()` 之后 `useThemeStore.load()`（主窗口与悬浮窗都走这条路径）。
- **智能体配色（`modules/theme/`，无迁移无面板）**：`theme_get` 返回当前主题 + 全部预设清单（含深/浅色系分组、可用十六进制提示）；`theme_set` 支持 `accent`（预设 id **或中文名或 `#rrggbb`**）/`background`（同上，浅底自动切浅色系）/`radius`/`reset`，可一次改多项，非法值只跳过并在回复里说明原因；改完立即生效并落库。`prompts.ts` 规则 6 要求：用户只说感觉（"太暗了""想要清爽一点"）时主动给具体搭配并直接应用一套。
- **注意**：日程类别颜色是用户自选的固定色板（`lib/colors.ts`），**不随主题色变化**，面板文案已注明。

### scout 模块 ✅（校招信息库 · 抓取版）
- **采集方式换了**（用户拍板，旧链路已删）：不再用「联网搜索 + LLM 提取」搜集候选，改为**直接抓取校招汇总页的公开数据**。流程：读汇总页 → 解析内联清单 `const META = { files, total }`（括号配平 + 字符串感知，分片名做路径安全校验）→ 逐个下载 `data/<name>.json` 分片（429/5xx/网络错误指数退避重试 3 次、20s 超时、分片间隔 150ms）→ 字段归一化 → 去重入库。请求走 **tauri-plugin-http**（无 CORS；capabilities `https://*` 已放开）。`src/modules/scout/collect.ts`（多查询搜索 + LLM 提取 + scout_collect/scout_keep）**已整体删除**。
- **由 Python 移植**：`campus_recruit_crawler.py` → `src/modules/scout/crawl.ts`（`parseManifest` / `readRecords` / `buildDedupeKeys` / `toRecordInput` / `crawlCampusRecruits`），应用内不再需要 Python。
- **数据表**：`campus_recruits`（**scout:1** 迁移；旧 `job_listings` 已 DROP）。源站 17 字段全量落库（company/batch/positions/location/industry/nature/month/update_date/full_date/deadline/app_link/source_link/link_source/evaluation/is_key/is_commercial/commercial_expiry/is_featured_card）+ `raw_json` 原文兜底 + `first_seen_at`/`updated_at`；多值字段（地点/行业）以 `,` 连接。
- **截止时间必须归一化（踩过的坑）**：源站 `deadline` 是**自由文本**（实测 251 种取值）——`2026/11/9` 占 5018 条，`招满为止` 1230 / `招满即止` 247 / `尽快投递` 79 共 1556 条没有日期，另有 `5.18`（省略年份）、`2026年6月 14`、`2 月 13 日中午 12 点`。**一条都不是 `YYYY-MM-DD`**，所以早期"按 `deadline GLOB 'YYYY-MM-DD*'` 判有无日期"的写法把全部记录都当成"无截止"→ **按截止排序等于没排、「还能投递」也完全失效**。现方案：`lib/deadline.ts` 的 `parseDeadline()` 解析成 `YYYY-MM-DD`（省略年份的用该行 `full_date` 的年份补），存进 **`deadline_iso` 列（scout:2 迁移 + 启动时一次性回填 `backfillDeadlineIso()`，实测 9461 条约 1s）**；排序与「还能投递」一律用 `deadline_iso`，展示用 `deadline_iso ?? deadline`（没有具体日期的仍显示"招满为止"原文）。
- **更新/发布时间排序用 `full_date`**：源站 `update_date` 是 `8.28`/`9.14` 这种「月.日」无年份格式，字符串排序会让 10/11/12 月错位（`10.5` < `8.28`）；`full_date` 才是 ISO（9461/9461 规范）。
- **去重入库**：`dedupe_key` UNIQUE —— **网申链接在本次抓取内唯一**时用 `link:<appLink>`，否则用 `cp:公司␁批次␁岗位`（源站把同一链接挂在多条记录上时不会误合并）；批次内同键先合并（保留更新的那条）。已存在的走 `ON CONFLICT DO UPDATE` 只刷新字段、**保留 first_seen_at**，所以可以反复点按钮不会产生重复。UPSERT 40 行/批（23 列 ≈ 920 个绑定参数，稳在 SQLite 变量上限内）。
- **按钮**：ScoutView 头部**「抓取并入库」**一键完成抓取+去重入库，带分片进度条与结果提示（新增 / 刷新 / 源内重复合并 / 字段缺失跳过），失败给可读原因。
- **检索 + 多列多重筛选 + 排序 + 分页**：关键词（公司/岗位/地点/行业/性质/来源，LIKE 通配符已转义）+ 公司名筛选 + **6 列多选筛选**（批次 / 收录月份 / 行业 / 性质 / 工作地点 / 信息来源；**列内 OR、列间 AND**）+「仅看重点」+「**还能投递**」（截止日期未过；截止为空/非 `YYYY-MM-DD` 的一律保留，用 `GLOB` 判格式）+ 一键重置（显示生效条件数）；候选值带计数、多值字段自动拆分，来自全表聚合。
  - **筛选下拉可搜索**：每个多选下拉顶部有搜索框（打开即自动聚焦、键盘直接打字），选项按子串匹配，**已选中的置顶**，并显示「N / 总数 个匹配」——选项上百个也能快速找到。
  - **排序**（`CampusSort`；UI 是筛选行右侧的「排序 xxx 正序/倒序」按钮，点已选项即切换方向）：默认（重点优先→更新日期）/ **更新·发布时间**（按 `full_date`）/ **截止时间**（按 `deadline_iso`）/ 收录时间 / 公司名 × 正序倒序。**「没有截止时间的排最后」**（`ORDER BY (deadline_iso IS NULL) ASC, deadline_iso ASC|DESC, …`）：有确切日期的按日期排好，`招满为止/尽快投递/空` 共 4430 条统一压在末尾（正序倒序都一样）。想"尽快截止的优先"就用「还能投递 + 截止正序」，已过期的会被过滤掉。
  - **分页**：底部页码条（首页/上下页/末页/跳页输入 + 每页 50/100/200），`limit + OFFSET` 只取当页（9461 条也不卡），筛选/排序/关键词变化时渲染期同步回到第 1 页，换页自动滚回顶部。
- **卡片**（按用户反馈定型）：每条 2 行、宽松不拥挤 —— 第 1 行 = ★公司 + 批次标签 + **性质标签（圈起来的胶囊，勿再改成纯文本）** + 📍地点 + 🏭行业（`flex-wrap` 不硬截断）；第 2 行 = 岗位（截断 + title 全文）+ 截止（过期加删除线）+ 来源/更新；右侧常驻「**去投递**」按钮（跳网申页）+ 悬停显示的「同步」书签与删除。
- **投递语义（用户明确要求，勿回退）**：① 卡片按钮是「**去投递**」= 用系统浏览器打开网申链接（缺网申链接时退回信息来源页），**只跳转、绝不写库**——避免"点进去看一眼"就被记成已投递；② 同步到求职监控改为**手动**：悬停出现的书签按钮 / 右键「同步到求职监控（我已投递）」，成功后行内显示「✓ 已同步」；③ 打开页面即读 `listJobs()` 建立「公司+职位」集合用于显示已同步状态与防重复（职位名统一按 50 字截断作为比对键）；④ 失败显示真实错误文本，不做静默。
- **Agent 可查本地库**：`scout_companies`（**公司维度汇总**：去重公司 + 条目数/★数/批次/地点/行业/最近更新，GROUP_CONCAT 聚合，回答"我可以投递哪些公司"）/ `scout_list`（具体岗位 + 地点 + 截止 + 网申链接 + id，支持 `sortBy`/`sortDir` 排序）/ `scout_stats`（概览：总数/公司数/今日/7 天/★ + 批次·行业·地点·来源分布 Top N）；三者共用同一套筛选参数（keyword/company/批次/行业/性质/月份/地点/来源/仅重点/`openOnly`）；`scout_refresh`（抓取入库，直行）；`scout_delete`、`scout_clear`（删除前必须复述确认）。写入后 `scoutStore.bump()` 让页面即时刷新。
- **prompt 规则 5**（`kernel/agent/prompts.ts`）：招聘/校招问题**一律查本地校招信息库，不要用 web_search 现搜**——问"有哪些公司"→ `scout_companies`；问岗位/链接 → `scout_list`；问整体 → `scout_stats`；"还能投的"传 `openOnly=true`；库为空先 `scout_refresh`。
- **联动**：条目「投递此职位」→ `createJob` 进求职监控；右键菜单 投递/打开网申/打开来源/删除。入口：TopBar「招聘」标签 + Sidebar「校招信息库」+ Cmd+K `app.openScout`（视图 id 仍是 `scout`）。

### jobs 模块 ✅（求职监控）
- **看板工作台**：`uiStore.appView`（"calendar"|"jobs"）主区视图；TopBar 视图组加「求职」；Sidebar「求职监控」入口 + Cmd+K `app.openJobs`；日期导航仅日历视图显示
- **五列看板**（JobsBoard.tsx，懒加载分包 7.7KB）：已投递/面试中/Offer/已拒绝/已归档，列头计数 + 状态圆点，卡片（公司/职位/日期/备注摘要）点击编辑，hover 删除（两步确认），顶部统计条 + 添加按钮；JobFormDialog 创建/编辑共用（公司/职位/状态 Select/投递日期/链接/备注）
- **数据**：`job_applications` 表（jobs:0 模块迁移），状态机 `applied→interviewing→offer/rejected/archived`，service CRUD + 状态计数
- **搜索 ✅（用户要的"变多了找不到"）**：状态筛选那一行右侧一个搜索框，**空格分词 = 全部命中（AND）**，搜索范围是**公司 / 职位 / 备注 / 链接 / 状态名**（例：`字节 实习`、`腾讯 笔试`、`面试` 能按状态名找）。命中处在公司/职位/备注里**高亮**（琥珀色 `<mark>`，重叠区间合并）；标题栏显示「共 N 份投递 · 匹配 M 条」，搜索框右侧显示 `M/N`；空结果区分"没有记录 / 该状态无记录 / 没有匹配「xxx」"（后者带「清除搜索」）。快捷键：**`/` 聚焦、Esc 清空**（正在输入框打字时不抢键）。过滤走 `service.ts` 的纯函数 `matchJob/filterJobs/jobHaystack` —— 与 Agent 工具同一套规则，所以能被无头测试覆盖（26 条断言：字段范围、AND 语义、大小写、状态名、空词/多空格/特殊字符边界、真实落库往返）。
- **AI 工具**：`jobs_create`（直行）/ `jobs_update`（先复述确认，prompt 规则 2 已泛化覆盖）/ `jobs_list`（可按状态过滤，**新增 keyword 搜索**：同样搜公司/职位/备注/链接/状态名，返回里会说明"共 N 条里命中 M 条"——用户问"我投的字节那个怎么样了"时用它定位）；DeepSeek 等模型可直接"记录投递/XX进面试了"操作看板

### 联网搜索 ✅（web 模块 + 协议并行）
- **DeepSeek 原生搜索（默认，DSH 官方同款）**：Anthropic 兼容 Messages API（`https://api.deepseek.com/anthropic/v1/messages`，与 chat-completions 不同 base）+ 原生 `web_search_20250305` 工具（max_uses≤5），模型 `deepseek-v4-flash`，双鉴权头（x-api-key + Bearer）；响应解析 `web_search_tool_result` → url/title，摘要从 text 块 `citations[].cited_text` 按 url 关联去重；**key 自动复用 DeepSeek 供应商**（专用 key 或任一 deepseek.com 供应商），零额外配置；无结果块报错不降级抓取
- **其他后端**：Tavily（钥匙串 key）/ SearXNG（自托管）/ Wikipedia（免费降级兜底）
- **`web_search` 工具**（modules/web 新模块）：query + maxResults(1-8)，结果格式化（标题/URL/摘要截断）
- **协议并行（kernel:6）**：供应商可选 `openai-compatible`（任意兼容端点）或 `responses`（OpenAI 官方 Responses API，@ai-sdk/openai），baseURL/模型独立；responses 协议跳过 DeepSeek reasoning_content 透传（SDK 处理）；DeepSeek 官方亦支持 Responses API（api-docs.deepseek.com/api/create-response）
- **设置页「联网搜索」**：后端下拉 + DeepSeek 接口/模型可配 + Tavily key + SearXNG 地址 + 测试搜索

### M4 — 自迭代 ✅（`kernel/agent/memory.ts`）
- **反思**：`runReflection` 读 event_edits 最近 60 条（join events 标题、时间戳转可读）→ LLM（generateText 无工具）归纳 1-5 条偏好 → JSON 解析（剥 fence、容错）→ 写入 `preferences`（pending，去重）
- **技能沉淀**：`distillSkills` 统计对话中同轮工具组合出现次数，≥3 次 → skills 表（spec_json 存组合防重复，use_count 更新）
- **归档**：`archiveStalePreferences` pending 超 90 天 → archived
- **UI**：设置页「记忆与偏好」section（MemorySection.tsx）——运行反思/技能沉淀按钮、偏好列表（pending 确认→active / 生效中编辑/删除 / 归档折叠显示）、手动添加偏好、技能列表删除、via_agent 累计计数（≥20 自动触发提示）
- **自动链路**：启动时 `runMemoryMaintenance`（归档 + via_agent≥20 自动反思，静默失败）
- 偏好注入 prompt：prompts.ts 已存在（active 偏好 + 技能），写入端补齐即闭环

### M3 — RAG + 知识库 ✅（kernel:5）
- **RAG 核心** `kernel/rag/core.ts`：`chunkMarkdown` 标题层级分块（~700 字符/块、70 字符 overlap，标题进 metadata）→ `embedTexts` 用**当前供应商 embeddingModel**（批量 64、15s 超时、失败自动降级纯 FTS5）→ `upsertSourceChunks`/`deleteSourceChunks`（memories + memories_fts 同步；fts 重建为带 `doc_id` 关联列）→ `hybridSearch` RRF 合并（FTS5 短语 top24 + 向量余弦 top24 → 1/(60+rank)，向量阈值 0.12）
- **knowledge 模块**：`ingest.ts` 递归扫描 .md + hash 增量（未变跳过/变更重索引/消失清理）；5 个 kb 工具（search/listDocs/readDoc/createDoc/appendDoc，路径守卫防越界，create/append 后立即索引）；`KbDialog`（文件夹选择 dialog 插件 / 文档树+状态角标（绿/黄/红） / Markdown 预览（复用 Markdown 组件） / CodeMirror 编辑+保存并索引 / 30s 轮询静默扫描）
- **集成**：Sidebar 知识库入口 + Cmd+K `app.openKb`；KbDialog **懒加载分包**（CodeMirror 625KB 独立 chunk）；新插件 tauri-plugin-fs + tauri-plugin-dialog（capabilities：fs:default 放开 `**` 路径、dialog:default）

### 多 API 供应商 ✅（kernel:4）
`llm_providers` 表（多端点，每个独立 name/baseURL/chatModel/embeddingModel/模型缓存）；API key 走钥匙串 `user=llm-api-key:{providerId}`（旧单 key 自动迁移为「默认」供应商并清理）；`app_settings.active_provider_id` 记录当前供应商；设置页卡片式管理（添加/删除/设为当前/测试连接自动识别模型，点选模型立即生效）；**聊天面板模型选择器**：打开面板自动拉取当前供应商模型列表，下拉按供应商分组直接切换模型（刷新按钮手动重拉）；runtime 按当前供应商建 provider 实例（缓存 key 含 providerId）。

### 聊天 UI 重构 ✅（对齐 DeepSeek Harness 设计语言）
- **思考过程折叠行**：`ReasoningRow`（🧠 + "思考过程" + 摘要），折叠显示摘要（运行中跟随最新一行+扫光动画，完成后显示首行），整行点击展开全文（max-h 滚动）
- **工具调用单行**：`ToolRow`（状态图标 + 工具名 + 圆点 + 截断摘要），展开为 IN/OUT 卡片（参数/结果，max-h 滚动）；错误时折叠行直接显示失败首行；参数时间戳自动格式化为本地时间
- **TurnStatus**：等待首 token 显示"AI 思考中…"，超 15s 追加耗时时钟
- **滚动跟随**：仅钉在底部时自动跟随（向上翻阅不被流式拽走），离底时显示"回到底部"悬浮按钮；新一轮发送强制回底
- 流式输出光标（▍闪烁）；vite watcher 忽略编辑器临时文件（Windows EBUSY 崩溃已修）
- **Markdown 渲染**（react-markdown + remark-gfm）：AI 回复正文完整 MD（标题/列表/表格/引用/行内代码），代码块带语言标签 + 复制按钮（max-h 内部滚动），链接经 tauri-plugin-opener 用系统浏览器打开（Rust 侧已注册 + `opener:default` 权限）；输入区胶囊卡片（textarea 自动增高 + IME 组合态回车守卫）；模型下拉自动向上翻转（输入区在底部）+ 右边界钳制

### 修复 ✅（`d53a2ac`、`8b4002e`）
- **消息静默丢弃 3 处**：sessionId null 时 send 直接 return（→ 自动补初始化重发）；streaming 卡死吞消息（→ 可见提示）；Cmd+K 发送停在历史视图（→ 强制切回）。加 90s 看门狗防挂起。
- **迁移机制根治（重要）**：见地雷 16。

## 5. 验证基建（无头、离线优先）

| 脚本 | 用途 |
|---|---|
| `scripts/check-schema.mjs` | 全部 schema 按迁移顺序执行 + FTS5 + 会话回退/搜索冒烟 + 校招信息库（旧表已删 / 去重键 UPSERT / 列内 OR+列间 AND） |

> 主题/配色改动后建议做一次**对比度校验**（无头）：用 OKLab 复刻 `color-mix` 与半透明叠底，断言 ①深色系所有类别/状态派生色文字 ≥ 4.5:1（当前 12.2）、②浅色系 ≥ 4.5:1（当前最差 5.0，琥珀色是瓶颈）、③正文对底色 ≥ 7:1、④旧式"混白 78%"在浅色系只有 1.04:1（反证）。类别基准色、`--tint-*`、`--color-white` 任一改动都要重跑。
| `scripts/check-migration.mjs` | **迁移机制**：旧库升级补齐、二次启动幂等、skipIf 跳过 ALTER、中间插入新迁移 |
| `scripts/check-rrule.mjs` | RRULE 展开 16 断言（node:sqlite 镜像） |
| `scripts/check-intent.ts` | mock 中文意图解析 20 断言（tsx 直跑 TS） |
| `scripts/check-llm.ts` | LLM 运行时（mock fetch SSE）：文本流式/工具循环两轮/历史回放 schema |
| `scripts/test-deepseek*.ts` | 真 API（key 走环境变量 DEEPSEEK_KEY）：SDK 三场景 / 插件 JS 路径复现 / reasoning 诊断 |
| `scripts/test-plugin-js.ts` | 插件完整 JS 路径（invoke 劫持为真网络）复现验证 |

构建：`npm run build`（tsc+vite）· `cargo build`（src-tauri，capabilities 编译期校验）。DB：`%APPDATA%\com.riliagent.app\riliagent.db`。release 在 `src-tauri/target/release/bundle/`。

## 6. 技术地雷（踩过，勿重踩）

1. **rrule 时区坑**：禁止 `RRule.fromString` 字符串 DTSTART（按 UTC/时钟解析）；用自写 `rruleToOptions()` + `new RRule({...opts, dtstart: new Date(本地)})`。
2. **backdrop-filter 劫持 fixed**：`.glass` 的 blur 使 fixed 后代相对面板定位 → 自定义 fixed 元素必须 `createPortal(document.body)`。
3. **WebView2 无 confirm()/alert()**：两步按钮代替。
4. **sql 权限**：`sql:default` 不含 execute → 需显式 `sql:allow-execute`。
5. **事件层点击穿透**：整列绝对定位层必须 `pointer-events-none`，卡片 `pointer-events-auto`。
6. **WebView2 后台定时器节流**：时间 UI 用 10s 轮询 + focus/visibilitychange 刷新。
7. **node 下 rrule 是 CJS**：测试 default 导入；浏览器端无影响。
8. **单实例定位**：重复实例无独立 id，地址 = `masterId + originalStart`，一律带 `occurrenceStart`。
9. **AI SDK 版本配对**：`ai@^7` + `openai-compatible@^1.0.48`（V2 模型）；ai@4 与它运行时互斥（UnsupportedModelVersionError）。本项目用 streamText 纯客户端方案（useChat 无纯客户端模式）。
10. **streamText 续跑**：v7 默认 `stopWhen = isStepCount(1)` → 必须显式 `stopWhen: isStepCount(8)`。
11. **v7 字段名**：`tool()` 用 `inputSchema`；part：text-delta 用 `.text`、tool-call 用 `.input`、tool-result 用 `.output`；历史类型 `ModelMessage`；**tool-result 的 output 是 `{type:'text'|'error-text', value}` 对象，不是裸字符串**（历史回放 schema 校验会失败）。
12. **keyring 权限**：逐个 `keyring:allow-get/set/delete-password`（无 default 集）。
13. **http 插件 URL 作用域（大坑）**：`http:default` 不放开任何 origin，所有请求被拦（"url not allowed on the configured scope"）→ capabilities 配 `{ identifier: "http:default", allow: [{url:"https://*"},{url:"http://*"}] }`。
14. **stream 的 error part 不上抛 = UI"无错误也无反应"**：v7 把 InvalidPrompt/API 错误作为流内 error part（不 throw）→ 必须 `throw part.error`。
15. **DeepSeek thinking 模式**：历史 assistant 消息必须回传 `reasoning_content`，否则 400（"must be passed back"）。App 存推理内容到 `chat_messages.reasoning`，回传经**消息级 `providerOptions.openaiCompatible.reasoning_content`**（空串也透传；provider 对空 reasoning part 会省略字段——那是死路）。非 DeepSeek 端点不加。
16. **迁移寻址（大坑，已根治）**：`PRAGMA user_version` 是"数量对齐"，往迁移数组**中间**插新迁移会让旧库永久跳过它（app_settings/chat_sessions 曾因此从未建表，表现为"no such table"）。现改为 **`schema_migrations` 稳定 id 记录表** + 按 id 判重 + 旧库首次全量幂等重放；ALTER 类迁移用 `skipIf`（**SQLite 不支持 ADD COLUMN IF NOT EXISTS**，那是 PG 语法）。
17. **send 静默丢弃点**：sessionId 缺失 / streaming 卡死 / 停在历史视图 —— 均已加防御（补初始化重发、可见提示、强制切视图）。
18. **node:sqlite 参数语法**：用 `?` 位置参数；`$1` 会被当命名参数（仅测试脚本，应用层 rusqlite 的 `$1` 正常）。

## 7. 下一步：M1-M4 已全部实现（待整体真机验收），候选增强

- 真机验收 M3/M4（知识库索引 + 反思偏好链路）
- M4 遗留可选项：偏好"编辑"已支持；反思去重可升级为语义相似去重（当前精确匹配）；自动反思可加"反思结果推送通知"
- 技术债（§8B）：bundle 体积（KbDialog 已分包，主 chunk 仍 1.28MB）、release 重打包、日志收敛

## 8. 待办与缺口清单（未做事项同步）

### A. 未开工里程碑
- **M3 RAG + 知识库**：见 §7（唯一未开工的大块）
- **M4 自迭代**：反思任务（读 event_edits 生成 pending 偏好）、记忆设置页（偏好/技能查看/确认/编辑/删除）、技能沉淀（≥3 次提示）、偏好注入 prompt（prompts.ts 已查询 preferences/skills 表，只差写入端）、90 天无信号自动归档。event_edits 落位 ✓、preferences/skills 表已建 ✓

### B. 已知缺口 / 技术债
1. **bundle 体积**：前端单 chunk 1.06MB（gzip 315KB），未做代码分割（vite manualChunks / 懒加载）——桌面应用无网络成本，优先级低，发布前可做
2. **mock 演示不支持改/删意图**：parseIntent 只覆盖 create/list/freeSlots——演示模式体验不到"复述确认"链路（真 LLM 可用）
3. **无头测试缺口**：findFreeSlots（依赖 DB 未镜像）、chatStore 多会话逻辑、迁移后 chat.ts 的会话 CRUD——目前靠 build + 真机验证
4. **release 打包过期**：MSI/NSIS 冒烟是 M1 做的，M2/多会话/修复之后未重打包——发布前必须重跑 `npm run tauri build`
5. **Agent 改/删确认无硬拦截**：目前是 prompt 约束（模型不听话可能直接执行）——M2 决策如此，已知风险；可选：工具级 approval（AI SDK v7 有 toolApproval 机制可调研）
6. **全局快捷键注册失败静默**：lib.rs `let _ = register(...)`——失败时应用内 Ctrl+K（keydown）仍可用，但无提示
7. **可选增强**：会话标题重命名、设置页"打开数据库目录/备份"按钮、chat_messages 清理策略（个人规模暂可接受）
8. **日志噪音**：runtime.ts 的调试 console.log（`[chat] ...`）保留中，发布前可收敛为 debug 级

### C. 待用户确认
1. DeepSeek API key 是否已重置（在聊天中暴露过，已提醒）
2. 是否现在重新跑一次 release 打包

### D. 规格明确不做（已确认排除，勿再提）
多用户 / 云同步 / Google Calendar 同步 / 插件市场 / 动态插件加载 / 通知提醒 v1 / "此及以后"拆分系列 / 月视图内 resize / 原生文件 watch / 跨时区。

## 9. 环境

Node v24 / npm（无 pnpm）/ Rust 1.97.1（MSVC）/ WebView2。开发：`npm run tauri dev`。DeepSeek 实测 key 用户提供（聊天中贴过，已提醒用户重置）；测试脚本 key 一律走 `$env:DEEPSEEK_KEY`，**严禁写入代码/git**。
