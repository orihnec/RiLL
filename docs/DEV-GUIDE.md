# 二次开发规范

> 一句话：**先判断"这功能属于谁"，再照模板放文件。** 判错了比写错了更难修。
> 配套：`docs/ARCHITECTURE.md`（为什么这样分层）、`docs/REFACTOR-MAP.md`（拆分进度）、`CONTEXT.md`（行为地雷）。

---

## 1. 决策树：新功能放哪

| 你要加的东西 | 落点 | 要动的文件 |
|---|---|---|
| 全新业务领域（新表 + 新页面） | 新模块 `src/modules/<name>/` | 新目录 + `src/modules.ts` 一行 |
| 现有领域的新数据能力（查询/写库） | `<module>/service.ts` | 1 个 |
| 现有领域的新 AI 能力 | `<module>/tools.ts` | 1 个（自动注册） |
| 现有实体的新字段 | `<module>/schema-vN.sql` + `skipIf` | 2 个（SQL + `index.ts` 末尾追加） |
| 新工作台页面 | `<module>/views/XxxView.tsx` + `shell/workbench.ts` 一条 | 2 个 |
| 新弹层 / 浮层 | `shell/AppOverlays.tsx`（+ 可选 `workbench.ts` 的 `PANELS`） | 2 个 |
| 顶栏 / 侧栏新入口 | **不许直接加按钮** → 进 `workbench.ts` 注册表 | 1 个 |
| 全局快捷键 | `shell/hooks/useAppShortcuts.ts` | 1 个 |
| 跨模块通用能力（HTTP / 时间 / 格式化 / 错误） | `src/lib/` | 1 个 |
| 影响全应用的内核能力（Agent / RAG / DB / 搜索） | `src/kernel/` | — |
| 通用 UI 原语（按钮 / 对话框 / 下拉） | `src/components/ui/` | — |

**判定口诀**：有 SQL → 模块；有 UI 页面 → 模块 + 注册表；跨模块复用 → `lib`；改内核 → `kernel`。

---

## 2. 分层与依赖方向

```
components/ui  ←  shell  ←  modules/views  ←  modules/store  ←  modules/service  →  kernel/db
                                  ↘  modules/components（纯 props）
```

| 允许 | 说明 |
|---|---|
| ✅ `views → store → service` | 唯一的数据下行链路 |
| ✅ `views → components` | 纯展示，props 进出 |
| ✅ `shell → stores/shell/workbench` | 外壳只组合 |

| 禁止 | 原因 |
|---|---|
| ❌ `components/*.tsx` import service | 组件不许取数（历史债就在这里） |
| ❌ `service` import store / UI | 数据层不认识 UI |
| ❌ `kernel` import `modules` | 内核零依赖，否则模块不再可插拔 |
| ❌ 模块 A 直接 import 模块 B 的内部文件 | 只能走对方 `index.ts` / `service.ts` 的公开导出；跨模块联动（如 scout → jobs）必须写一行注释说明原因 |

---

## 3. 模块标准骨架

```
src/modules/<name>/
├─ index.ts           模块声明：id / name / migrations / tools（唯一出口）
├─ schema.sql         建表（只追加，不改历史）
├─ schema-vN.sql      后续迁移
├─ types.ts           领域类型（跨文件共用）
├─ service.ts         数据访问：SQL + 行映射 + 纯函数；或 service/ 目录
├─ tools.ts           Agent 工具（命名 <模块>_<动词>）
├─ store.ts           页面状态（zustand，可选：纯后端模块不需要）
├─ views/XxxView.tsx  页面：只组合（≤250 行）
├─ components/*.tsx   纯展示（≤150 行）
└─ format.ts          纯函数：键 / 文案 / 日期（无 React import）
```

**预算**：view ≤250 行 · component ≤200 行（表格/表单这类密集结构放宽到 200）· hook ≤120 行 · service 单函数 ≤40 行。
**命名**：组件 PascalCase；hook `useXxx`；service 动词开头（`list*/get*/create*/update*/delete*/sync*`）；工具 `<模块>_<动词>`；store `useXxxStore`。

---

## 4. 配方（照抄即可）

### 4.1 新增一个模块

```ts
// src/modules/notes/index.ts
import type { Module } from "../../kernel/module";
import schema from "./schema.sql?raw";
import { notesTools } from "./tools";

export const notesModule: Module = {
  id: "notes",
  name: "笔记",
  migrations: [schema],
  tools: notesTools,
};
```

```ts
// src/modules/notes/tools.ts
import { z } from "zod";
import type { Tool } from "../../kernel/agent/types";
import { createNote } from "./service";

export const notesTools: Record<string, Tool> = {
  notes_create: {
    name: "notes_create",
    // description 写清「什么时候用 / 什么时候别用」，模型靠它选工具
    description: "新建一条笔记。仅当用户明确要求记录内容时使用。",
    parameters: z.object({ title: z.string(), body: z.string() }),
    execute: async (args) => {
      const n = await createNote({ title: String(args.title), body: String(args.body) });
      return `已创建笔记：${n.title}`;
    },
  },
};
```

最后在 `src/modules.ts` 加一行：`notesModule,` —— **内核零改动**。

### 4.2 新增一个工作台页面

1. 在 `shell/workbench.ts` 的 `WORKBENCH` 加一条（`id` 同时要加进 `stores/uiStore.ts` 的 `AppView` 联合类型）：

```ts
{
  id: "notes",
  label: "笔记",            // 顶部按钮
  title: "笔记",            // 顶部标题 / 侧栏文案
  icon: NotebookPen,
  keywords: ["笔记", "notes", "记录"],
  hint: "笔记（本地 Markdown）",
  sidebarRank: 40,
  Component: lazy(() => import("../modules/notes/views/NotesView").then((m) => ({ default: m.NotesView }))),
}
```

顶部视图组、右键菜单、侧边栏、Cmd+K **四处自动生效**，不需要改 `TopBar` / `Rail` / `App` / `main`。

> ⚠️ 命令 id 由注册表派生（`app.open${Id}`）。**不要**在 `commands.ts` 里再手写 `app.openMail` / `app.openKb` 这类同名命令 —— 命令注册表对重复 id 会直接抛错（`duplicate command`），表现为启动即停在错误页。只有注册表里没有的东西（如 `app.openHabits`、`app.jobTab.scout`）才手写。

2. 页面本体：

```tsx
// src/modules/notes/views/NotesView.tsx —— 只有组合
export function NotesView() {
  const { items, loading, search, setSearch, remove } = useNotesStore();
  return (
    <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl">
      <NotesToolbar search={search} onSearch={setSearch} />
      <NotesList items={items} loading={loading} onDelete={remove} />
    </div>
  );
}
```

### 4.3 新增 Agent 工具（三条硬约束）

1. 命名 `<模块>_<动词>`，与模块同名，方便 `prompts.ts` 按域路由；
2. `description` 必须写清**触发条件**；改/删类工具必须写"先复述内容并得到用户确认再调用"（参考 `mail_schedule_confirm`）；
3. `execute` 返回**可直接显示给用户的中文文本**（含结果与下一步提示），不要返回裸 JSON。

### 4.4 新增迁移（数据库只增不改）

| 场景 | 写法 |
|---|---|
| 新表 | `CREATE TABLE IF NOT EXISTS ...` |
| 加列 | `ALTER TABLE t ADD COLUMN c ...` + `skipIf`（查 `pragma_table_info`，SQLite 没有 `ADD COLUMN IF NOT EXISTS`） |
| 加索引 | `CREATE INDEX IF NOT EXISTS ...` |
| 删表 / 改列 | **不写**。确需 → 新增迁移做数据搬迁，旧列保留至少一个版本 |

规则：迁移只能**追加到模块 `migrations` 数组末尾**（id 自动为 `模块:下标`），**绝不插到中间或重排**——否则老库会永久跳过它（历史故障：`app_settings` / `chat_sessions` 曾因此从未建表）。

### 4.5 新增弹层

```tsx
// shell/AppOverlays.tsx 里加一个
<Suspense fallback={null}><NotesDialog /></Suspense>
```

如果还需要侧边栏/命令栏入口，再往 `workbench.ts` 的 `PANELS` 加一条（`open: () => useNotesStore.getState().setOpen(true)`）。

### 4.6 新增 store

| 状态类型 | 放哪 |
|---|---|
| 只被一个模块用（列表、筛选、分页、选中项） | `modules/<m>/store.ts` |
| 跨模块 / 全应用（主题、设置、工作台视图、聊天） | `src/stores/` |

store 只暴露**动作**（`load/add/remove/setXxx`），不暴露裸 setter；异步动作内部 `set({status:"loading"})` → 成功/失败一次更新。

---

## 5. 代码风格：简洁优先，不写防御性代码

只在**两个地方**处理失败：① 会失败的外部动作（网络 / IMAP / 写库）→ 一行 UI 提示；② 启动期 → 不让应用白屏。

| # | 规则 | 反例 → 正例 |
|---|---|---|
| 1 | 不写静默吞错 | `catch (e) { console.warn(e) }` → 删掉 catch，或 `flash(errMsg(e))` |
| 2 | 错误文案统一 | `e instanceof Error ? e.message : String(e)` → `errMsg(e)`（`lib/error.ts`） |
| 3 | 内部函数不做参数兜底 | `if (!input.title) return;` → 删（TS 已保证） |
| 4 | 默认值只在数据边界设 | DB 行 → 领域对象补一次；渲染层不再重复 `?? "—"` |
| 5 | 不写"以防万一"的状态机 | 三重 loading 标记 → 一个 `status` 枚举 |
| 6 | 两步确认是功能不是防御 | WebView2 无 `confirm()`，按钮二次点击必须保留 |

命名与注释：注释用中文，只写**为什么**与**勿改原因**；类型集中在 `types.ts`；不带调试日志进主分支。

---

## 6. 提交前自检（12 条）

1. `npx tsc --noEmit` 0 错误；2. `npm run build` 通过；
2. 新增入口只改了 `workbench.ts`（没有散落在 TopBar/Sidebar）；
4. 页面文件没有 `await service.*`；5. 组件没有业务分支；6. service 里没有 UI import；
7. 迁移只追加、带 `skipIf`；8. 新工具命名 `<模块>_<动词>` 且有确认约束；
9. 没有新增 `catch { console }`；10. 没有新增 `instanceof Error` 三元；
11. 文件没超预算（view 250 / component 150 / hook 120）；12. `CONTEXT.md` 地雷清单若被触碰，已同步更新。

---

## 7. 反例集（仓库里真实存在过）

```tsx
// ❌ 组件里直接取数（拆之前 ScoutView/MailDock 都这样）
function ScoutView() {
  const [rows, setRows] = useState([]);
  useEffect(() => { listCampusRecruits().then(setRows); }, []);
}
// ✅ 数据在 store/hook，组件只组合
function ScoutView() {
  const { rows } = useScoutQuery();
}
```

```ts
// ❌ 同一入口登记四处（TopBar 按钮 / TopBar 右键 / Sidebar / main 命令）
// ✅ 只在 workbench.ts 写一次，其余遍历生成
```

```ts
// ❌ 迁移插到中间 → 旧库跳过
migrations: [schema, schemaV3, schemaV2]
// ✅ 只在末尾追加
migrations: [schema, schemaV2, schemaV3]
```

---

## 8. 当前目录

```
src/
├─ main.tsx            启动：迁移 → 设置 → 命令 → 渲染 → 后台服务
├─ modules.ts          ★ 全部模块清单
├─ shell/              ★ 外壳
│  ├─ App.tsx          布局：Rail + CalendarPanel + 主区 + AI 抽屉 + 弹层栈
│  ├─ Rail.tsx         56px 图标栏（**唯一导航入口**）
│  ├─ CalendarPanel.tsx 日历专属面板（小月历 / 习惯 / 类别），只在日历视图出现
│  ├─ TopBar.tsx       Context Bar：只放当前视图相关控件
│  ├─ AppOverlays.tsx  弹层栈（设置 / 日程 / 命令栏 / 习惯 / 关闭确认 / 类别）
│  ├─ workbench.ts     ★ 工作台与面板注册表（唯一入口来源）
│  ├─ commands.ts      Cmd+K 命令（从注册表派生）
│  ├─ overviewWindow.ts
│  ├─ chat/            ChatDock（右侧**抽屉**，不挤压主区）+ format + hooks + components
│  └─ hooks/{useAppShortcuts,useCloseRequest,useMonthEventDays}.ts
├─ kernel/             db / migrations / module / commands / agent / rag / services
├─ modules/            业务模块（模板见 §3）
│  ├─ calendar/        service / habits（习惯=带 RRULE 的重复事件）/ tools / components
│  ├─ jobs/            service / search / statusStore / 组件（JobCenterView 三个页签）
│  ├─ scout/           crawl / service / tools / 组件（作为求职中心的「信息库」页签）
│  ├─ mail/            service / sync / threading / 组件（MailView 是**一级页面**）
│  └─ knowledge/       ingest / tools / 组件（KbView 是**一级页面**）
├─ stores/             跨模块状态：ui / theme / settings / chat / category / kb / mail / scout
├─ components/ui/      通用原语
├─ components/markdown.tsx
└─ lib/                time / colors / themes / url / attachment / deadline / error / useTwoStepConfirm
```

**页面 vs 弹层**：日历、求职中心、待办、邮箱、知识库都是**一级页面**（同一套 `appView` 切换）；
只有"临时介入"的东西才是弹层：设置、新建/编辑日程、习惯管理、类别管理、命令栏、关闭确认。
