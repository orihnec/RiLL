# RiliAgent — Personal AI Calendar

个人效率桌面工具：Notion Calendar 式日历 + AI Agent + RAG 个人知识库。

- **纯本地**：Tauri 2 壳 + SQLite 单文件，无服务器端；LLM 走 OpenAI 兼容 API（baseURL 可配置）
- **内核稳定**：`src/kernel` 只负责 db / Agent 运行时 / RAG 核心 / Cmd+K / UI 外壳
- **模块化**：新增功能 = 在 `src/modules` 新增目录并在 `src/modules.ts` 加一行，内核零改动

## 技术栈

React 19 + TypeScript + Vite 7 + Tailwind CSS v4 + shadcn/ui + Framer Motion + Zustand
Tauri 2（Rust 仅注册插件）+ tauri-plugin-sql（SQLite）

## 开发

```bash
npm install
npm run tauri dev     # 启动桌面应用（开发模式）
npm run build         # 前端类型检查 + 构建
```

## 里程碑

- M1 日历核心（周/月视图、CRUD、拖拽、RRULE 重复+例外）
- M2 Agent + Cmd+K（LLM 接入、日历工具、流式对话）
- M3 RAG + 知识库（分块/embedding/混合检索、Markdown 知识库）
- M4 自迭代（event_edits → 偏好/技能沉淀）

## 目录结构

```
src/
├─ main.tsx       # 启动：迁移 → 设置 → 命令 → 渲染 → 后台服务
├─ modules.ts     # ★ 全应用唯一模块清单
├─ shell/         # 外壳：App / TitleBar / TopBar / Sidebar / MiniMonth / 弹层栈
│  ├─ workbench.ts  # ★ 工作台与面板注册表（顶部/侧栏/右键/Cmd+K 的唯一入口来源）
│  └─ commands.ts   # Cmd+K 命令（从注册表派生）
├─ kernel/        # 内核：db 迁移调度 / module 加载器 / agent 运行时 / rag / 搜索 / 提醒
├─ modules/       # 业务模块（calendar / jobs / interviews / scout / todo / knowledge / mail / theme / web）
├─ stores/        # 跨模块状态（ui / theme / settings / chat / category / kb / mail / scout）
├─ components/    # 通用原语（ui/）+ Markdown
└─ lib/           # 时间、颜色、主题、URL、附件、错误文案
```

## 维护铁律

1. 页面（`views/`）只组合，**不取数、不写业务分支**；数据走 `store` / hook；
2. `components/` 只负责渲染，props 进出，不 import service；
3. 所有 SQL 只出现在各模块 `schema.sql` 与迁移文件中，迁移**只追加、不重排**；
4. 新增 Agent 能力 = 对应模块 `tools.ts` 加一个工具对象；
5. 新增入口（页面/弹层/命令）只改 `shell/workbench.ts`，不在 TopBar / Sidebar 里手写按钮。

## 文档

- [docs/INTERVIEW-REVIEWS.md](docs/INTERVIEW-REVIEWS.md) —— 面经记录、逐题复盘、草稿恢复与开发验证
- [docs/DEV-GUIDE.md](docs/DEV-GUIDE.md) —— **二次开发规范**（新功能放哪、模板、自检清单）
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) —— 结构梳理、分层理由、精简方案
- [docs/REFACTOR-MAP.md](docs/REFACTOR-MAP.md) —— 文件级拆解图与进度
- [docs/REFACTOR-REPORT.md](docs/REFACTOR-REPORT.md) —— **重构报告**（前后对比、验证证据、遗留项）
- [CONTEXT.md](CONTEXT.md) —— 进度、已拍板决策、技术地雷（改代码前必读）
