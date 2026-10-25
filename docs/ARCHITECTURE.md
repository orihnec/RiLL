# RiliAgent 结构梳理与精简方案

> 状态：**分析报告 + P0/P1 已落地** · 生成时间：2026-10
> 配套文档：`CONTEXT.md`（进度/决策/地雷）、`README.md`（快速入门）、`docs/DEV-GUIDE.md`（二次开发规范）、`docs/REFACTOR-MAP.md`（文件级拆解）
> 硬约束：**数据库不变动** —— 21 个 `.sql` 文件内容、迁移 id 生成规则、表/列/索引全部保持原样。

**进度**

| 阶段 | 状态 | 结果 |
|---|---|---|
| P0 清场 | ✅ | 删 `src/App.tsx`、`src/App.css`、`src/assets/react.svg`、`src/components.json`；新增 `lib/error.ts` |
| P1 外壳拆分 | ✅ | `src/app/` → `src/shell/`；App.tsx 629 → **47 行**；工作台/面板注册表 `shell/workbench.ts`；Cmd+K 命令改由注册表派生；`tsc` 0 错、`vite build` 通过 |
| P2-P7 | 待做 | 见 §6 |
| P2 通用骨架 | ⏭ 跳过 | Pager 只有 scout 用 → 收进模块内，不放进 `components/ui`（避免过早抽象） |
| P3 scout 页 | ✅ | `ScoutView.tsx` 1,018 → **198 行**；新增 `format.ts` + 3 个 hook + 5 个组件；`tsc` 0 错、`build` 通过（chunk 25.3 kB） |
| P4 jobs 页 | ✅ | `JobsBoard.tsx` 833 → **160 行**；`search.ts`（纯函数）+ `format.ts` + `useJobsBoard` + 7 个组件；`tsc` 0 错、`build` 通过（chunk 21.4 kB） |
| P5 chat 坞 | ✅ | `ChatDock.tsx` 1,010 → **160 行**；`format.ts` + 2 hook（滚动跟随 / 锚定菜单）+ 6 组件；`tsc` 0 错、`build` 通过 |
| P6 mail | ✅ | `MailDock.tsx` 1,916 → **364 行**。拆成：`useMailWorkspace`（775，逻辑）+ `AccountRail` 154 / `ThreadList` 172 / `ThreadView` 147 + `MessageCard` 283 + `AccountDialog` 321 + `format.ts` 43。`tsc` 0 错、`build` 通过；bundle class 字符串数 292 = 拆分前 292（无 markup 丢失） |
| P7 防御收敛 | ✅ | `instanceof Error` 22 → 2；`console.log` 6 → 2；`errText` 合并为 `errMsg`；删 4 条调试追踪 |
| P8 导航与页面化 | ✅ | `Sidebar`（224px 列表）→ `Rail`（56px）+ `CalendarPanel`（日历专属面板）；AI 由常驻 360px 改为**浮层抽屉**；邮箱/知识库由 Dialog 升为**一级页面**（`MailView` / `KbView`）；`AppView = calendar / jobs / mail / kb / todo` |

---

## 1. 全貌

| 项 | 值 |
|---|---|
| 形态 | Tauri 2 桌面壳 + React 19 + TypeScript + Vite 7 + Tailwind v4 + zustand |
| 数据 | SQLite 单文件 `%APPDATA%\com.riliagent.app\riliagent.db`，纯本地无服务端 |
| 前端源码 | ≈ 21,676 行 / 123 文件（ts / tsx / sql，不含 Rust 与 node_modules） |
| 业务模块 | 8 个：calendar / jobs / scout / todo / knowledge / mail / theme / web |
| 迁移文件 | 21 个 `.sql`（kernel 8 · mail 6 · scout 3 · 其余各 1） |
| Rust 侧 | 仅插件注册 + `src-tauri/src/mail.rs`（自实现 IMAP，约 700 行有效逻辑） |

数据流：`组件 → store/hook → modules/<m>/service.ts → plugin-sql → SQLite`；
Agent 侧：`chatStore → kernel/agent/runtime → 工具表（modules/<m>/tools.ts）→ service`。

---

## 2. 目录职责（现状）

| 目录 | 规模 | 职责 | 评价 |
|---|---|---|---|
| `src/kernel/` | 23 文件 / 2,158 行 | db 迁移调度、模块加载器、命令注册表、Agent 运行时、RAG、搜索、提醒、会话 CRUD | 结构清晰，**保留** |
| `src/modules/` | 56 文件 / 12,901 行 | 8 个业务模块（schema / service / tools / components） | **问题集中区** |
| `src/stores/` | 9 文件 / 1,143 行 | zustand 全局状态 | 归属不统一 |
| `src/app/` | 12 文件 / 3,535 行 | 应用外壳（布局、弹层）+ 聊天坞 | 布局与业务混杂 |
| `src/components/` | 11 文件 / 1,016 行 | ui 原语（button/dialog/select/popover/…）+ Markdown 渲染 | **保留** |
| `src/lib/` | 7 文件 / 753 行 | 时间、颜色、主题、URL、附件、截止日期 | **保留** |
| `src/modules.ts` | 20 行 | 全应用唯一模块清单 | 设计正确，作为样板 |

### 模块明细

| 模块 | 文件 | 行数 | 组件数 | SQL | 说明 |
|---|---|---|---|---|---|
| mail | 19 | 5,600 | 3 | 6 | 最大模块：IMAP 本地化 + 会话合并 + AI 排程 |
| scout | 8 | 2,284 | 1 | 3 | 校招抓取 + 多列筛选 + 投递联动 |
| calendar | 9 | 2,114 | 4 | 1 | RRULE 展开 + CRUD + 空闲时段 |
| jobs | 7 | 1,482 | 2 | 1 | 求职看板 + 搜索 |
| todo | 5 | 721 | 1 | 1 | 待办清单 |
| knowledge | 5 | 517 | 1 | 1 | Markdown 知识库 + 索引 |
| theme | 2 | 136 | 0 | 0 | 主题读写（无 UI，走 stores/lib） |
| web | 1 | 47 | 0 | 0 | 联网搜索工具 |

---

## 3. 六个结构病灶

### 3.1 巨组件：页面逻辑全埋在 JSX 里

| 文件 | 行数 | 症状 |
|---|---|---|
| `modules/mail/components/MailDock.tsx` | 1,888 | 单组件 1,240 行、20+ `useState`：账号、文件夹、会话、正文懒加载、同步、实时监听、右键菜单全在一处 |
| `modules/scout/components/ScoutView.tsx` | 1,018 | 筛选/排序/分页/抓取/同步/删除七套状态与 JSX 交织 |
| `app/chat/ChatDock.tsx` | 997 | 流式渲染、历史面板、模型选择、工具行、滚动跟随 |
| `modules/jobs/components/JobsBoard.tsx` | 833 | 看板 + 搜索高亮 + 表单弹窗 |
| `app/App.tsx` | 629 | TopBar、Sidebar、MiniMonth 三个组件内联在同一文件 |
| `app/SettingsDialog.tsx` | 530 | 供应商/搜索/记忆三段设置混排 |

### 3.2 同一入口四处登记

`setAppView("jobs")` / `("scout")` / `("todo")` 各出现 **4 次**：TopBar 按钮、TopBar 右键菜单、Sidebar、`main.tsx` 的命令注册。
新增一个工作台必须改 4 个文件，漏一处就"侧边栏有、命令栏没有"。

### 3.3 分层规则被自己违反

- `README` 铁律①："components 只渲染，不直接调 service" → 实际 `ScoutView`、`MailDock`、`JobsBoard`、`App.tsx` 内的 `MiniMonth` 都直接 `import service`。
- 反向依赖：`stores/uiStore.ts` import 了模块组件里的 `DialogState`（`modules/calendar/components/EventDialog`），store 依赖视图层。

### 3.4 store 归属不统一

三种做法并存：全局 `stores/*.ts`（7 个）、模块内 `modules/jobs/statusStore.ts`、以及"只有版本号"的 `mailStore` / `scoutStore`（真数据仍在组件里）。同一种东西（页面数据）三个位置。

### 3.5 service 一锅炖

| 文件 | 行数 | 混在一起的职责 |
|---|---|---|
| `modules/mail/service.ts` | 1,232 | 账号 CRUD、文件夹、邮件头/正文、会话聚合、同步游标、AI 抽取落库 |
| `modules/scout/service.ts` | 629 | 查询构建、候选值聚合、统计、UPSERT、回填 |
| `modules/calendar/service.ts` | 572 | RRULE 展开、例外处理、CRUD、编辑 diff 记录、空闲时段 |

### 3.6 死代码与防御噪音

**死代码**：`src/App.tsx`（脚手架残留）、`src/App.css`（46 B）、`src/assets/react.svg`、`public/vite.svg`、空的 `src/components.json`。

**防御噪音（全量统计）**

| 标记 | 次数 |
|---|---|
| `try {` | 127 |
| `catch (` | 139 |
| `??` | 357 |
| `?.` | 204 |
| `console.warn/error` | 76 |
| 手写 `e instanceof Error ? e.message : String(e)` | 21 |

典型症状：`catch (e) { console.warn(...) }` 静默吞错 20+ 处；内部函数对 TS 已保证的参数做 `if (!x) return`；同一层数据在 store、hook、渲染里各兜一次默认值。

---

## 4. 目标结构（精简后）

```
src/
├─ main.tsx                 启动（≤80 行）：迁移 → 设置 → 命令 → 渲染 → 后台服务
├─ modules.ts               ★ 唯一模块清单
├─ index.css
├─ kernel/                  db / migrations / module / commands
│  ├─ agent/{runtime,prompts,registry,memory}.ts
│  ├─ rag/core.ts
│  └─ services/{chat,reminder,search}.ts      ← 根级散文件下移归档
├─ shell/                   ★ 应用外壳（原 app/ 的布局部分）
│  ├─ App.tsx               ≤100 行，只有布局
│  ├─ {TitleBar,TopBar,Sidebar,MiniMonth}.tsx
│  ├─ Overlays.tsx          弹层栈（设置/知识库/邮箱/日程/命令栏/关闭确认/类别）
│  ├─ workbench.ts          ★ 工作台注册表：一处登记 → 顶部按钮/右键/侧栏/Cmd+K 全派生
│  ├─ commands.ts           命令注册（遍历注册表）
│  └─ hooks/{useAppShortcuts,useCloseRequest,useMonthEventDays}.ts
├─ modules/<name>/
│  ├─ index.ts              模块声明（迁移 / tools / 命令 / 面板）
│  ├─ schema*.sql           不动
│  ├─ service.ts | service/ 数据访问
│  ├─ tools.ts              Agent 工具
│  ├─ store.ts              ★ 页面状态（从组件搬出）
│  ├─ views/XxxView.tsx     ★ 只组合，≤250 行
│  ├─ components/*.tsx      ★ 纯展示，≤150 行
│  └─ format.ts             纯函数（去重键 / 文案 / 日期）
└─ ui/                      通用原语（现 components/ 迁入）
```

### 三条硬规则（建议写入 README）

1. **页面不写业务分支**：`views/` 只负责布局与组合，条件逻辑在 `store.ts` / hook / `format.ts`。
2. **页面状态只有一个家**：要么模块内 `store.ts`，要么模块内 hook；不允许"数据和 UI 状态都散在组件里"。
3. **一个能力只有一个登记点**：工作台、弹层、Cmd+K 命令一律由 `shell/workbench.ts` 派生。

### 体积目标

| 指标 | 现在 | 目标 |
|---|---|---|
| 最大页面文件 | 1,888 行 | ≤250 行 |
| 最大组件文件 | 1,888 行 | ≤150 行 |
| App.tsx | 629 行 | ≤100 行 |
| 入口登记处 | 4 处 | 1 处 |
| `catch` | 139 | ≤30 |
| `??` | 357 | ≤120 |
| `console.warn/error` | 76 | ≤15 |

---

## 5. 代码风格：简洁优先，不写防御性代码

**只在这两种地方处理失败**

1. 会失败的外部动作（网络、IMAP、写库）→ 一行 UI 提示；
2. 启动期（`boot()`）→ 不让整个应用白屏。

**六条落地规则**

| # | 规则 | 反例 → 正例 |
|---|---|---|
| 1 | 删静默吞错 | `catch (e) { console.warn(e) }` → 直接不 catch，或 `flash(errMsg(e))` |
| 2 | 统一错误文案 | 21 处 `e instanceof Error ? e.message : String(e)` → `lib/error.ts` 里 5 行 `errMsg(e)` |
| 3 | 内部函数不做参数兜底 | `if (!input.title) return;`（TS 已保证非空）→ 删除 |
| 4 | 默认值只在数据边界设一次 | DB 行 → 领域对象时补默认；渲染层不再 `?? "—"` 重复兜 |
| 5 | 不做"以防万一"的状态机 | 双 `useState` 互锁、三重 loading 标记 → 一个状态枚举 |
| 6 | 保留必要的两步确认 | WebView2 无 `confirm()`，按钮二次点击确认必须保留（这是功能，不是防御） |

**阅读顺序优先**：一个文件应当能从上到下读完 —— 类型 → 纯函数 → store → 视图。

---

## 6. 实施顺序（每阶段跑 `tsc` + `vite build`）

| 阶段 | 内容 | 风险 | 验收 |
|---|---|---|---|
| P0 | 删死代码 + 建 `lib/error.ts`、`lib/format.ts` | 极低 | 构建通过，行为不变 |
| P1 | `app/` → `shell/`：拆 TopBar/Sidebar/MiniMonth/Overlays/快捷键；建 `workbench.ts` + 派生命令 | 低 | App ≤100 行，入口 4→1 |
| P2 | 通用页面骨架 `ui/{PageShell,Toolbar,Pager,ConfirmButton,EmptyState}` | 低 | scout 与 jobs 复用同一套 |
| P3 | scout：1,018 → view 200 + `store.ts` + 5 组件（FacetFilter/SortControl/Pager/RecruitCard/Header） | 中 | 筛选/排序/分页/抓取行为完全一致 |
| P4 | jobs：833 → view + `store.ts` + 卡片/表单/工具栏 | 中 | 搜索高亮、`/`、Esc 快捷键不变 |
| P5 | chat：997 → store + 消息列表 / 输入区 / 历史面板 / 模型选择 / 工具行 | 中 | 流式、滚动跟随、回退不变 |
| P6 | mail：1,888 → 三栏 shell + 4 组件；`mail/service.ts` 拆 6 文件（账号/文件夹/邮件/会话/同步/抽取） | 高 | 单独一轮，先备份 DB 副本对照 |
| P7 | 防御代码收敛（catch 139→≤30）+ console 收敛 + 更新本文档与 CONTEXT.md | 低 | 全量构建 + 手工冒烟 |

---

## 7. 数据库不变动：边界清单

**绝对不碰**

- `src/**/*.sql` 的**内容**（21 个文件）；
- `kernel/module.ts` 的迁移 id 规则：`${module.id}:${index}`；
- `kernel/db.ts` 的 `schema_migrations` 记账机制与 `skipIf` 语义；
- 表名、列名、索引名、`PRAGMA` 设置。

**允许动**

- 迁移文件在 `index.ts` 里的**引用顺序无关**的整理（不新增、不删减、不重排数组顺序）；
- service 层的 SQL 字符串**移动位置**（拆文件/改函数名），语句本身保持不变。

---

## 8. 重构时必须保留的行为（源自 CONTEXT.md §6 地雷）

1. `fixed` 元素必须 `createPortal(document.body)`（`.glass` 的 blur 会劫持定位）。
2. 整列绝对定位层 `pointer-events-none`，卡片 `pointer-events-auto`。
3. WebView2 后台定时器节流 → 时间 UI 用 10s 轮询 + focus/visibilitychange。
4. rrule 禁止 `RRule.fromString`，必须 `new RRule({...opts, dtstart: 本地 Date})`。
5. 单实例定位 = `masterId + originalStart`，一律带 `occurrenceStart`。
6. AI SDK v7：`stopWhen: isStepCount(8)`、`tool({inputSchema})`、tool-result 的 `output` 是对象。
7. 邮件 HTML 双保险：`sanitize.ts` + `iframe sandbox="allow-same-origin"`（不给 allow-scripts）。
8. 实时接收的 Rust 长连接与 `mail://watch` 事件（去抖 2 秒 + 同账号串行）。
