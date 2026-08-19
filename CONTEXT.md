# RiliAgent — 项目上下文（压缩版）

> 用途：任何新会话 / 新 agent 快速恢复现场。M1（日历核心）已全部完成并通过人工验收。
> 最后更新：M1 验收通过后（2025-06）。

---

## 1. 产品

个人效率桌面工具：Notion Calendar 式日历 + AI Agent（Cmd+K 为核心入口）+ RAG 个人知识库（本地 Markdown）。

**硬约束**：纯本地（无服务器端，Rust 只当壳）；LLM 走云端 OpenAI 兼容 API（baseURL 可配置）；数据源仅本地日程 + 本地 Markdown；内核稳定、功能模块化（新增功能 = 新增模块目录，内核零改动）。

## 2. 已拍板的设计决策（勿再翻案）

| 领域 | 决策 |
|---|---|
| 重复事件 | 完整 RRULE（每日/每周/每月/每年 + 间隔 + COUNT/UNTIL）；单实例例外（override + EXDATE）；**"此及以后"拆分系列明确不做** |
| 视图 | M1 含完整月视图；月视图交互最小化（点击编辑/拖拽换日，无月内 resize） |
| embedding | 与 chat 同供应商、模型可配；失败自动降级纯 FTS5 关键词检索并在设置页提示 |
| 自迭代 | 手动为主：偏好确认后常驻；超 90 天无信号且未确认过 → 自动归档（可恢复） |
| API key | tauri-plugin-keyring（Windows 凭据管理器）；Tauri 2 不可用则回退 stronghold |
| 冲突/时区 | 允许重叠（不警告）；unix ms 按本机时区解释，单时区 |
| 类别 | 固定 8 色低饱和渐变（`src/lib/colors.ts`），可自定义名称 |
| 混合检索 | RRF 合并向量+FTS5，top-k 8，metadata 过滤 source/path/tag |
| 知识库监听 | 30s 轮询 + 手动"立即索引"，不做原生 watch |
| Markdown 编辑 | CodeMirror 6（M3 时引入） |
| 反思触发 | 累计新增 via_agent diff ≥ 20 条 或 手动按钮 |
| 技能 v1 | 工具序列重复 ≥3 次提示保存；仅作 system prompt 行为提示注入；run_skill 模板留 M4 后期 |
| Agent 确认 | create 类工具直接执行；update/delete 前 Agent 必须文本复述等用户确认（M2 落地为 prompt 约束 + 多轮对话，见 §6 备注） |
| 提醒通知 | v1 不做（notification 插件先装着） |
| **CORS** | LLM 请求必须走 **tauri-plugin-http**（webview 直接 fetch 自建网关会撞 CORS）；逻辑仍在 TS |

## 3. 架构与维护铁律

```
src/kernel/        # 内核（除 bug 外不改）：db.ts 迁移调度 / module.ts 加载器
│                  #   agent/{types,registry}.ts · rag/sources.ts · commands.ts
src/modules/       # calendar（schema/service/recurrence/components）· knowledge（骨架）
src/modules.ts     # ★ 全应用唯一模块清单
src/app/           # 外壳：App.tsx（TopBar/Sidebar/MiniMonth/快捷键）· SettingsDialog.tsx
src/stores/        # zustand：calendarStore / settingsStore / kbStore / chatStore
src/lib/           # time.ts · colors.ts · utils.ts（cn）
```

铁律：① components 只渲染，数据来自 store；② 所有 SQL 只在模块 schema.sql 与迁移文件中；③ 新增 Agent 能力 = 在对应模块 tools.ts 加一个工具对象。

## 4. 已完成（M1，全部验证 + 人工验收）

| 提交 | 内容 |
|---|---|
| `cda082e` | C0-C1 脚手架（Tauri2+React19+Vite7+Tailwind4+shadcn+Zustand+Framer Motion）+ 内核加载器 + SQLite 迁移调度（PRAGMA user_version） |
| `c94d9bd` | C2 周视图：时间网格（56px/h）、当前时间线（10s 轮询 + focus 刷新 + HH:mm 徽标）、CRUD 对话框、拖拽改时间/跨天、resize、重叠分 lane、全天条 |
| `61a1e4a` | C3 月视图：网格、事件芯片、拖拽换日（Portal 幽灵）、+N 弹层、MiniMonth 事件点 |
| `bee88d4` | C4 RRULE 全套：展开引擎 + exdate/override 例外 + 系列作用域对话框 + 无头测试 |
| `bf5802d` | C5 设置弹层骨架、快捷键（Ctrl+N/1/2/T/,）、空状态、release 打包冒烟（MSI+NSIS） |
| `dbb5ef5` | fix: sql:allow-execute（sql:default 不含 execute） |
| `1df6143` | fix: 双击穿透、跨天拖拽消失、popover/select 透明（补 --popover token） |
| `d1ba3dc` | fix: 红线过期（节流）+ 时间徽标 |
| `e6a627b` | fix: 月视图拖拽幽灵偏移（backdrop-filter 劫持 fixed → Portal） |

**验证命令**：`npm run build`（tsc+vite）· `cargo build`（src-tauri）· `node scripts/check-schema.mjs`（schema+FTS5）· `node scripts/check-rrule.mjs`（RRULE 16 断言，node:sqlite 镜像数据流）。

数据库：`%APPDATA%\com.riliagent.app\riliagent.db`（备份 = 复制文件）。release 产物在 `src-tauri/target/release/bundle/`。

## 5. 技术地雷（踩过，勿重踩）

1. **rrule 时区坑**：`RRule.fromString` 解析 DTSTART 会按 UTC 或运行时时钟——禁止用字符串 DTSTART。用自写 `rruleToOptions()`（FREQ/INTERVAL/COUNT/UNTIL/BYDAY/BYMONTHDAY/BYMONTH）+ `new RRule({...opts, dtstart: new Date(本地时间)})`（service.ts 内）。
2. **backdrop-filter 劫持 fixed**：`.glass`（backdrop-filter: blur）会为 fixed 后代创建包含块 → 自定义 fixed 元素必须 `createPortal` 到 document.body（月视图拖拽幽灵案例）。
3. **WebView2 无 confirm()/alert()**：两步按钮代替（EventDialog 删除确认）。
4. **sql 权限**：`sql:default` 不含 execute → capabilities 需显式 `sql:allow-execute`。
5. **事件层点击穿透**：整列绝对定位层必须 `pointer-events-none`，卡片 `pointer-events-auto`，否则双击新建永远到不了列处理器。
6. **WebView2 后台定时器节流**：时间相关 UI 用 10s 轮询 + focus/visibilitychange 强制刷新。
7. **node 下 rrule 是 CJS**：测试脚本用 default 导入（`import pkg from "rrule"`），浏览器端 Vite 无影响。
8. **单实例定位**：重复事件实例无独立 id，地址 = `masterId + originalStart`；拖拽/编辑/删除都要带 `occurrenceStart` 才走 override/exdate 路径，否则整系列生效。

## 6. 下一步：M2 — Agent + Cmd+K

**验收标准**：输入"明天下午 3 点和老王开会 1 小时" → 正确创建并显示。

| 步 | 内容 |
|---|---|
| M2-1 | 设置页 LLM 配置：baseURL / chatModel / embeddingModel 持久化（新增 kernel 迁移：`app_settings(key TEXT PK, value TEXT)`）+ keyring 存 API key |
| M2-2 | 内核 agent 运行时：`kernel/agent/runtime.ts` 封装 Vercel AI SDK `useChat` + 客户端 tools 循环；**fetch 用 @tauri-apps/plugin-http**（绕 CORS）；`kernel/agent/prompts.ts` 组装 system prompt（当前日期时间 + 时区 + active 偏好 + 技能 + 行为约束） |
| M2-3 | `modules/calendar/tools.ts` 5 工具：`calendar_listEvents / createEvent / updateEvent / deleteEvent / findFreeSlots`（Tool 接口扩展 zod schema；update/delete 需先文本复述） |
| M2-4 | 右侧对话面板：流式输出 + 工具调用状态展示（打勾/加载中）；chat_messages 表落库 |
| M2-5 | Cmd+K：shadcn command（cmdk）+ 命令注册表接入 + tauri-plugin-global-shortcut 全局唤起；输入框即对话框，自然语言回车交给 Agent |
| M2-6 | **先 mock LLM 跑通工具注册与调用链路**（规格要求），再接真实 API；M2 结束暂停验收 |

**M2 备注**：改/删确认 v1 采用 prompt 约束 + 多轮对话（Agent 复述 → 用户说"确认" → Agent 调用工具），比 UI 拦截简单可靠；findFreeSlots 用 listOccurrences 结果在 JS 侧扫描实现；工具全量注入（<30 个无需路由）。

## 7. M3 / M4 摘要（规格原文，细节到时再展开）

- **M3 RAG + 知识库**：memories 表已建（kernel schema）；分块（标题层级，~500 token，overlap 50）/ embedding / 混合检索（RRF）；kb 模块：文件夹选择（fs 插件）、mtime+hash 增量索引、文档树 UI、5 个 kb 工具（search 两阶段：混合检索 → kb_readDoc 精读）；支持问"上周我忙了什么"（日历摘要也入 RAG，但 listEvents 优先）。
- **M4 自迭代**：event_edits 全链路已就位（via_agent 标记）；反思任务 → pending 偏好（记忆设置页确认/编辑/删除）；技能沉淀；偏好注入 system prompt。

## 8. 环境

Node v24 / npm（无 pnpm）/ Rust 1.97.1（MSVC）。开发：`npm run tauri dev`（二进制已预编译，启动快）。
