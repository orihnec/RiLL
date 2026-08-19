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
├─ kernel/        # 内核：db 迁移调度 / module 加载器 / agent 注册表 / rag 源 / 命令
├─ modules/
│  ├─ calendar/   # 日历模块：schema / service（CRUD+occurence 展开）/ 组件
│  └─ knowledge/  # 知识库模块（M3）
├─ modules.ts     # ★ 全应用唯一模块清单
├─ app/           # 外壳：布局 / TopBar / Sidebar
├─ stores/        # zustand 分 store（calendar / settings / kb / chat）
└─ lib/           # 时间、颜色、通用工具
```

## 维护铁律

1. `components/` 只负责渲染，数据来自 store，不直接调 core/kernel；
2. 所有 SQL 只出现在各模块 `schema.sql` 与迁移文件中；
3. 新增 Agent 能力 = 只在对应模块 `tools.ts` 加一个工具对象。
