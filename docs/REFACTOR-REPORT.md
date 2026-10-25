# 重构报告（P0–P7 完成）

> 目标：前端代码逻辑更清晰、更易维护；页面逻辑重构；**数据库/迁移零改动**。
> 配套：[ARCHITECTURE.md](ARCHITECTURE.md)（结构与病灶）、[REFACTOR-MAP.md](REFACTOR-MAP.md)（文件级拆解）、[DEV-GUIDE.md](DEV-GUIDE.md)（二次开发规范）、`CONTEXT.md`（行为地雷）。
> 时间：2026-10 · 每阶段均以 `npx tsc --noEmit` + `npm run build` 收口。

---

## 1. 完成清单

| 阶段 | 内容 | 结果 |
|---|---|---|
| P0 | 清场：删死代码、建 `lib/error.ts` | 删 `src/App.tsx`、`App.css`、`assets/react.svg`、`src/components.json`、`shell/chat/ChatBridge.tsx`（墓碑文件） |
| P1 | `app/` → `shell/`，工作台注册表，命令派生 | `App.tsx` 629 → **47 行**；入口登记 4 处 → **1 处** |
| P2 | 通用页面骨架 | **跳过**（Pager 仅 scout 用，`PageShell` 只是套 div；过早抽象） |
| P3 | scout 页 | `ScoutView.tsx` 1,018 → **198 行** |
| P4 | jobs 页 | `JobsBoard.tsx` 833 → **160 行**，搜索纯函数下沉 `search.ts` |
| P5 | chat 坞 | `ChatDock.tsx` 1,010 → **160 行** |
| P6 | mail 工作台 | `MailDock.tsx` 1,916 → **364 行**（逻辑入 `useMailWorkspace` 775 行，三栏各自组件） |
| P7 | 防御代码收敛 + 日志收敛 | `instanceof Error` 22 → **2**；`console.log` 6 → **2**；`errText` 合并为 `errMsg` 别名 |

## 2. 规模对比

| 文件 | 重构前 | 重构后 |
|---|---|---|
| `modules/mail/components/MailDock.tsx` | 1,916 | **364** |
| `modules/scout/components/ScoutView.tsx` | 1,018 | **198** |
| `shell/chat/ChatDock.tsx` | 1,010 | **160** |
| `modules/jobs/components/JobsBoard.tsx` | 833 | **160** |
| `shell/App.tsx` | 629 | **47** |
| `modules/mail/service.ts` | 1,232 | 1,253（**未拆**，见 §6） |

新增结构性文件（全部带单一职责）：

```
src/shell/            workbench.ts(注册表) · commands.ts · TopBar/Sidebar/MiniMonth · AppOverlays
src/shell/hooks/      useAppShortcuts · useCloseRequest · useMonthEventDays
src/shell/chat/       format.ts · hooks/{useStickToBottom,useAnchoredMenu} · components/6 个
src/modules/scout/    format.ts · hooks/{useScoutQuery,useScoutCrawl,useJobSync} · components/7 个
src/modules/jobs/     format.ts · search.ts · hooks/useJobsBoard · components/7 个
src/modules/mail/     format.ts · hooks/useMailWorkspace · components/{AccountRail,ThreadList,ThreadView,MessageCard,AccountDialog,folderIcon}
src/lib/error.ts      errMsg（唯一异常文案出口）
```

## 3. 落地的三条架构规则

1. **一个能力只有一个登记点**：工作台/面板入口全部来自 `shell/workbench.ts`，顶部按钮、右键菜单、侧边栏、Cmd+K 四处自动派生。实测 `setAppView("jobs"|"scout"|"todo")` 硬编码 **0 处**。
2. **页面只组合**：`views/` 不取数、不写业务分支；数据在 `store`/hook，纯展示在 `components/`，SQL 只在 `service`。
3. **service 保留 barrel**：拆分后旧导入路径不变，可逐个模块落地与回滚（本轮 jobs 的 `search.ts` 即通过 `export *` 保留兼容）。

## 4. 防御代码：收敛了什么、保留了什么

**已收敛**

- 手写 `e instanceof Error ? e.message : String(e)` **20 处** → 统一 `errMsg(e)`；`mail/format.ts` 的 `errText` 改为 `errMsg` 别名，不做第二份实现。
- 删除 4 条调试追踪日志（`[chat] runRealChat start` / `streamText created` / `stream consumed` / `send →`）。
- 清理随组件迁移产生的"僵尸导入"约 40 条（`tsc --noUnusedLocals` 逐条报出）。

**刻意保留（不是漏网）**

- `.catch(console.warn)` 这类**单行**守卫（settings/category/statusStore 的后台持久化）：失败不该打断 UI，删掉会变成 unhandled rejection。它们是"边界兜底"，符合"只两处处理失败"的规则。
- `runtime.ts` 的 `part.error instanceof Error ? part.error : new Error(...)`：这是**类型收窄**（要抛出 Error 对象），不是文案拼接。
- 启动期 `try/catch`（`boot`、迁移、设置加载）：唯一的"不让应用白屏"兜底。

**结论**：`catch` 数量本身不是指标 —— 本轮盯的是"重复实现"和"噪音日志"，而不是把错误处理删空。

## 5. 验证证据

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误（每个阶段收口时均执行） |
| `npm run build` | 通过；主 chunk 1,548.58 kB / gzip 462.99 kB（与重构前 1,548.57 kB 持平，说明只是搬位置没加体积） |
| `node scripts/check-schema.mjs` | 全部 schema 执行 OK；FTS5 / 会话回退 / 校招去重与多列筛选冒烟全过 → **数据库层未受影响** |
| 组件完整性交叉校验 | mail 重构后 bundle 中 `className` 字符串数 **292 = 拆分前 292**，关键布局类名全部命中 |
| 分包体积 | MailDock 61.5 → 64.0 kB（多出的是三栏组件边界），ScoutView 25.3 kB、JobsBoard 21.4 kB |

## 6. 遗留与建议（下一轮可选）

| 项 | 说明 | 建议 |
|---|---|---|
| `modules/mail/service.ts` 1,253 行 | 账号/文件夹/邮件/会话/同步/正文修复混在一起 | 按 `REFACTOR-MAP §9` 拆 8 个文件 + barrel，风险低 |
| `shell/SettingsDialog.tsx` 541 / `calendar/WeekView.tsx` 523 / `todo/TodoView.tsx` 391 | 仍超 250 行预算 | 按 scout/jobs 同样的 hook+组件套路拆 |
| `useMailWorkspace.ts` 775 行 | 逻辑集中但偏大 | 内部再拆 `useMailAccounts` / `useThreadList` / `useThreadReader` / `useMailSync` / `useThreadActions` |
| P2 通用骨架 | 当时判定过早抽象 | 等第三个页面出现相同结构再抽 |
| 无运行时真机验收 | 本轮只做静态验证 | 建议 `npm run tauri dev` 冒烟：邮箱三栏、会话已读、AI 扫描、日程拖拽、聊天流式 |

## 7. 两次事故与由此形成的纪律

| 事故 | 后果 | 恢复 | 纪律 |
|---|---|---|---|
| 用 `git checkout -- src/main.tsx` 判断失误（该文件有未提交修改） | 启动逻辑被换成旧版 88 行（丢主题加载、提醒、邮件通知、悬浮窗分支） | 按会话最初读到的原文逐行还原，再迁出命令注册 | 覆盖前先确认工作区状态；不确定就别用 checkout |
| 用 PowerShell 拼接文本重建组件（`@($a,$b) -join` 嵌套数组） | 三栏 JSX 一度被删成 `System.Object[]` | 按会话已读内容逐行重建 + 用 bundle 的 292 个 className 交叉校验 | **源码只许用 read/write/edit 改**；脚本最多做整文件字节级读写 |

另外一次编码事故：用 `Get-Content -Raw`（隐式 ANSI）改注释导致 `jobs/service.ts` 全文件中文乱码 —— 已按 UTF-8 → GBK 逆向恢复并逐行修好，`U+FFFD` 计数归零。**中文文本禁止走 PowerShell 隐式编码路径。**

---

## 8. 一句话总结

把 4 个 800–1,900 行的页面级巨组件拆成「页面 ≤200 行 + 逻辑入 hook + 展示入组件」，把 4 处重复的入口登记收成 1 张注册表，把 20 处手写错误文案收成 1 个函数；数据库与迁移一行未动，构建与 schema 冒烟均通过。

---

## 9. 后续追加（P7–P8 与功能迭代）

| 项 | 结果 |
|---|---|
| P7 防御收敛 | 手写 `instanceof Error` 22 → 2；`console.log` 6 → 2；`errText` 并成 `errMsg` 别名 |
| 两步确认去重 | 新增 `lib/useTwoStepConfirm`，替掉 scout / jobs / chat / 历史面板 / 习惯 5 处各自维护的 `setTimeout` |
| mail 动作收敛 | `useMailWorkspace` 的 11 个动作全部走 `run(label, fn)`，样板代码只剩一份 |
| P8 导航重构 | `Sidebar`(224px) → `Rail`(56px) + `CalendarPanel`（仅日历视图）；AI 由常驻 360px 改为浮层抽屉；`AppView` 收敛为 `calendar / jobs / mail / kb / todo` |
| 页面化 | 邮箱 `MailDock`(Dialog) → `MailView`(357 行页面)；知识库 `KbDialog` → `KbView`(233 行页面)；"一半页面一半弹层"的状态结束 |
| 求职中心 | 新增 `JobCenterView`（准备投递 / 已投递 / 信息库 三页签）+ `PreparingBoard`；复用 `job_applications`，状态列表新增 `preparing`（老库自动补齐，不改动既有数据） |
| 习惯 | 不加新表：习惯 = 带每周 RRULE 的重复事件；`habits.ts` + `HabitDialog` + `habit_list` / `habit_create` 两个工具 |
| AI 多日程 bug | 去掉 `streamText` 的单次 30s 超时（多步循环会被误判），并在"已发生工具调用"时禁止一次性重放 —— 根治"卡住 + 重复创建" |
