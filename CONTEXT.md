# RiliAgent — 项目上下文（压缩版）

> 用途：任何新会话 / 新 agent 快速恢复现场。
> 状态：**M1 ✅ 验收 · M2 ✅ 真机联调通过 · 多会话增强 ✅ · 迁移机制已根治**。下一步 M3（RAG + 知识库）。
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
src/app/           # App.tsx · SettingsDialog（测试连接+模型列表）· CommandPalette · chat/ChatDock（双视图）
src/stores/        # calendarStore / settingsStore / chatStore（多会话）/ uiStore / kbStore
src/lib/           # time.ts · colors.ts · utils.ts
```

铁律：① components 只渲染，数据来自 store；② 所有 SQL 只在 schema.sql 与迁移文件中；③ 新增 Agent 能力 = 模块 tools.ts 加一个工具对象。

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

### 修复 ✅（`d53a2ac`、`8b4002e`）
- **消息静默丢弃 3 处**：sessionId null 时 send 直接 return（→ 自动补初始化重发）；streaming 卡死吞消息（→ 可见提示）；Cmd+K 发送停在历史视图（→ 强制切回）。加 90s 看门狗防挂起。
- **迁移机制根治（重要）**：见地雷 16。

## 5. 验证基建（无头、离线优先）

| 脚本 | 用途 |
|---|---|
| `scripts/check-schema.mjs` | 全部 schema 按迁移顺序执行 + FTS5 + 会话回退/搜索冒烟 |
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

## 7. 下一步：M3 — RAG + 知识库（M2 已验收，随时开工）

- **RAG 核心**（kernel 已就绪：memories/memories_fts 表）：分块（标题层级 ~500 token overlap 50）→ embedding（设置页已有 embeddingModel 字段，同供应商；失败降级纯 FTS5）→ 混合检索（RRF，metadata 过滤 source/path/tag）
- **knowledge 模块**：文件夹选择（tauri-plugin-fs，capabilities 需配 fs scope）、mtime+hash 增量索引、文档树 UI + Markdown 预览/编辑（CodeMirror 6）、索引状态角标、5 个 kb 工具（`kb_search` 两阶段：混合检索 → `kb_readDoc` 精读；`kb_listDocs` / `kb_createDoc` / `kb_appendDoc`）
- 日历摘要可入 RAG（"上周我忙了什么"），但 Agent 优先走 `calendar_listEvents`
- M3 结束暂停验收；之后 M4 自迭代（event_edits 链路已就位）

## 8. 环境

Node v24 / npm（无 pnpm）/ Rust 1.97.1（MSVC）/ WebView2。开发：`npm run tauri dev`。DeepSeek 实测 key 用户提供（聊天中贴过，已提醒用户重置）；测试脚本 key 一律走 `$env:DEEPSEEK_KEY`，**严禁写入代码/git**。
