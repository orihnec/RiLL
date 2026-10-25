# 重构拆解图（文件级）

> 用途：把"要重构"变成"哪一段代码搬到哪个文件"，逐个文件可执行、可验收。
> 配套：`docs/ARCHITECTURE.md`（病灶与目标结构）、`docs/DEV-GUIDE.md`（二次开发规范）、`CONTEXT.md`（行为地雷）。
> **行号基于当前工作区状态**（2026-10）。拆分只做**搬移与改名**，不改业务行为；数据库零改动。

**进度**：P0 ✅ · P1 ✅（`shell/`）· P2 ⏭（不做通用骨架）· P3 ✅（scout 1018→198）· P4 ✅（jobs 833→160）· P5 ✅（chat 1010→160）· P6 ✅（mail 1916→364，逻辑入 hook、三栏入组件）· P7 ✅（防御收敛）· P8 ✅（Rail + AI 抽屉 + 邮箱/知识库页面化）。

---

## 0. 总览

| 源文件 | 现行数 | 拆成 | 拆分后最大文件 |
|---|---|---|---|
| `app/App.tsx` | 629 | 9 | ≤120（App.tsx） |
| `modules/scout/components/ScoutView.tsx` | 1,018 | 10 | ≤220（ScoutView.tsx） |
| `modules/jobs/components/JobsBoard.tsx` | 833 | 7 | ≤200（JobsBoard.tsx） |
| `app/chat/ChatDock.tsx` | 997 | 9 | ≤230（ChatDock.tsx） |
| `app/SettingsDialog.tsx` | 530 | 5 | ≤160（SettingsDialog.tsx） |
| `modules/mail/components/MailDock.tsx` | 1,888 | 14 | ≤200（MailDock.tsx） |
| `modules/calendar/service.ts` | 572 | 6（+barrel） | ≤210（occurrence.ts） |
| `modules/mail/service.ts` | 1,232 | 8（+barrel） | ≤220（threads.ts） |
| `modules/scout/service.ts` | 629 | 5（+barrel） | ≤230（query.ts） |
| `modules/jobs/service.ts` | 190 | 2（+barrel） | ≤150 |

原则：**根文件只保留组合**；叶子（format / 纯函数）先拆，状态与视图后拆；service 一律留 `service.ts` 作 barrel，**导入路径不变**，可逐个落地、逐步验证。

---

## 1. 通用拆分模板

```
<module>/
├─ <Feature>View.tsx        组合：布局 + 传 props（不许有业务分支）
├─ store.ts                 ★ 页面状态 + 动作（zustand，或 useXxxState hook）
├─ components/*.tsx         纯展示，props 进出
├─ format.ts                纯函数：键、文案、日期、截断
└─ service.ts | service/*.ts  数据访问（SQL）
```

判定标准（拆完自查）：

- 组件文件里出现 `await service.xxx()` → 不合格（应在 store/hook）；
- 组件文件里出现 `if (loading) return ...` 之外的业务条件分支 → 不合格；
- `format.ts` 与 `store.ts` 不 import 任何 `.tsx` → 可被无头脚本测试。

---

## 2. `src/app/App.tsx`（629 行）→ `src/shell/`

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 1-70 | — | import 收敛（按目标文件分发） |
| 53-70 | `shell/views/lazy.ts` | 4 个 `lazy()` 声明（Kb/Jobs/Scout/Todo/Mail） |
| 73-257 | `shell/TopBar.tsx` | `TopBar()`：日期导航 + 视图组 + 全局按钮；视图组改由注册表生成 |
| 261-341 | `shell/MiniMonth.tsx` | `MiniMonth()`；事件圆点数据移入 `shell/hooks/useMonthEventDays.ts` |
| 343-479 | `shell/Sidebar.tsx` | `Sidebar()`；入口改由注册表遍历 |
| 484-493 | `shell/overviewWindow.ts` | `toggleOverviewWindow()` |
| 508-523 | `shell/hooks/useCloseRequest.ts` | 关闭请求监听 |
| 525-575 | `shell/hooks/useAppShortcuts.ts` | 键盘快捷键 + `riliagent:cmd-k` |
| 577-634 | `App.tsx` | 布局组合：`TitleBar / Sidebar / TopBar / WorkbenchArea / ChatDock / AppOverlays` |
| 612-631 | `shell/AppOverlays.tsx` | 弹层栈（设置/知识库/邮箱/日程/命令栏/关闭确认/类别） |

新增两个"唯一事实来源"文件（不存在于当前代码，属于合并去重）：

- `shell/workbench.ts`：`WORKBENCH`（jobs/scout/todo：id/label/title/icon/keywords/hint/Component）+ `PANELS`（kb/mail/settings：标签/图标/打开动作）。
- `shell/commands.ts`：遍历上表注册 Cmd+K 命令（现散在 `main.tsx` 1-106 行）。

等价性验收：`setAppView("jobs"|"scout"|"todo")` 在源码中从 **4 处**降到 **1 处**（仅 `workbench.ts` + 调用方）。

---

## 3. `modules/scout/components/ScoutView.tsx`（1,018 行）

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 53-104 | `scout/format.ts` | `FacetSelection`、`EMPTY_SELECTION`、`EMPTY_FACETS`、`PAGE_SIZES`、`positionOf`、`jobKeyOf`、`applyUrlOf`、`isExpired`、`deadlineLabel` |
| 108-227 | `scout/components/FacetFilter.tsx` | 多选筛选下拉（含搜索框/已选置顶/计数） |
| 231-295 | `scout/components/SortControl.tsx` | 排序控件（点已选项切正倒序） |
| 299-372 | `scout/components/Pager.tsx` | 分页条（首页/上下页/跳页/每页条数） |
| 381-505 | `scout/useScoutQuery.ts` | 查询状态（keyword/debounce/selection/onlyKey/openOnly/sort/page/pageSize）+ `query` memo + `result/stats/facets/loading` + `refresh` + 筛选变化回第一页 + `listRef` 滚顶 |
| 507-538 | `scout/useScoutCrawl.ts` | `runCrawl()`（分片进度）+ `flash` 提示 |
| 541-552 | `scout/useScoutCrawl.ts` | `clearAll()`（两步确认） |
| 558-590 | `scout/useJobSync.ts` | `jobKeys` 集合 + `syncToJobs()`（手动同步到求职监控） |
| 592-609 | `scout/useScoutQuery.ts` | `toggleValue` / `activeFilters` / `resetFilters` |
| 612-654 | `scout/menus.tsx` | 条目右键菜单 + 空白右键菜单（返回 `CtxMenuItem[]`） |
| 659-836 | `scout/components/ScoutHeader.tsx` | 标题 + 统计胶囊 + 抓取/刷新/清空 + 抓取进度条 + 提示条 |
| 755-836 | `scout/components/ScoutFilterBar.tsx` | 关键词框 + 6 个 FacetFilter + 仅看重点 + 还能投递 + 重置 + SortControl + 命中数 |
| 858-1018 | `scout/components/RecruitCard.tsx` | 单条卡片（两行信息 + 去投递 + 同步书签 + 删除确认） |
| 380-1041 剩余 | `ScoutView.tsx` | 组合：`useScoutQuery()` + 上面组件 + Pager + ContextMenu |

验收：`ScoutView.tsx` ≤220 行；`format.ts` 无 React import。

---

## 4. `modules/jobs/components/JobsBoard.tsx`（833 行）

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 46-50 | `jobs/format.ts` | `toDateInput` |
| 52-68 | `jobs/components/StatusBadge.tsx` | 状态徽标 |
| 68-114 | `jobs/components/StatusCell.tsx` | 单元格（含状态切换） |
| 114-253 | `jobs/components/JobFormDialog.tsx` | 新建/编辑弹窗（7 个字段 + 校验） |
| 253-290 | `jobs/components/Highlight.tsx` | 命中高亮（重叠区间合并） |
| 290-370 | `jobs/useJobsBoard.ts` | `jobs/loading/filter/query/sort` + `counts/statusIndex/visible/terms` + 排序分支 + `/`、Esc 快捷键 |
| 370-512 | `jobs/useJobActions.ts` | 删除两步确认、补链接（`linkState`/`linkMsg`）、右键菜单项、`refresh` |
| 512-830 | `jobs/components/JobsToolbar.tsx` + `JobsTable.tsx` | 头部统计/筛选/搜索、表格与行 |
| 797-833 | `jobs/components/LinkFillPicker.tsx` | 补链接候选选择 |
| 余下 | `JobsBoard.tsx` | 组合 |

验收：`format.ts`/`useJobsBoard.ts` 可被 `scripts/` 无头调用（搜索语义已由 `service.ts` 的 `matchJob/filterJobs` 保证）。

---

## 5. `src/app/chat/ChatDock.tsx`（997 行）

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 42-98 | `chat/format.ts` | `firstLine`、`latestLine`、`fmtDuration`、`copyText`、`fmtArgValue` |
| 100-174 | `chat/components/ToolRow.tsx` | 工具调用单行 + 展开 IN/OUT |
| 174-214 | `chat/components/ReasoningRow.tsx` | 思考过程折叠行 |
| 214-233 | `chat/components/TurnStatus.tsx` | 等待首 token / 耗时时钟 |
| 233-385 | `chat/components/HistoryPanel.tsx` | 历史会话（搜索/切换/新建/删除/回退） |
| 385-590 | `chat/components/ModelPicker.tsx` | 模型选择（分组/刷新/上翻） |
| 590-728 | `chat/components/MessageList.tsx` | 消息与工具转录顺序、回退操作行、回到底部按钮 |
| 728-997 | `chat/components/Composer.tsx` | 输入胶囊（自动增高/IME 守卫/附件 chips/发送/停止） |
| 613-660 | `chat/useChatScroll.ts` | `listRef`、`pinnedRef`、`atBottom`、"回到底部" |
| 613-720 | `chat/useComposer.ts` | `input`、附件、`attachBusy/attachError`、发送与键盘 |
| 余下 | `ChatDock.tsx` | 组合 + 头部 |

依赖前提：数据仍在 `stores/chatStore.ts`（本阶段不动 store，只搬视图）。

---

## 6. `src/app/SettingsDialog.tsx`（530 行）→ `src/app/settings/`

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 58-300 | `settings/ProviderCard.tsx` | 供应商卡（模型列表点选/Key 保存/测试连接/删除） |
| 301-390 | `settings/AddProviderDialog.tsx` | 新增供应商（协议选择） |
| 391-425 | `settings/AboutSection.tsx` | 数据库路径 / 版本 / 提醒提前量 |
| 426-529 | `settings/SettingsDialog.tsx` | 分区组合：LLM / 联网搜索 / 记忆偏好 / 提醒 / 快捷键 / 数据 |
| — | `settings/index.ts` | barrel（保持 `app/SettingsDialog` 旧路径 re-export） |

---

## 7. `modules/mail/components/MailDock.tsx`（1,888 行）

### 7.1 纯函数与小组件

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 99-143 | `mail/format.ts` | `PAGE_SIZE`、`fmtListDate`、`fmtFullDate`、`initials`、`avatarHue`、`folderIcon`、`errText` |
| 1391-1628 | `mail/components/MessageCard.tsx` | 会话内单封邮件（折叠预览 300px / iframe 自适应 / 链接列表 / 附件另存） |
| 1630-1888 | `mail/components/AccountDialog.tsx` | 添加/编辑邮箱（预设、探测、提醒、实时接收间隔） |
| 1318-1388 | `mail/components/MovePicker.tsx` | 移动到… |

### 7.2 状态与动作（现在全在 147-1388 的主组件里）

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 154-159 | `mail/useMailAccounts.ts` | `accounts/folders/expanded/activeAccountId/activeFolderId` + `loadAccounts` + 文件夹展开 |
| 160-166 | `mail/useThreadList.ts` | `threads/threadTotal/page/loadingThreads/keyword/query/unreadOnly` + `loadThreads` + `loadMore` + 滚动到底翻页 |
| 168-171 | `mail/useThreadReader.ts` | `thread/messages/loadingMsgs/showImages` + `openThread` + `openThreadById` + 已读标记 |
| 173-186 | `mail/useMailUi.ts` | `busy/progress/tip/ctx/dialog/missing/badBodies/reloadKey/pending` + `flash` |
| 374-437 | `mail/useMailSync.ts` | `syncOne` / `syncAll` / `refreshList` |
| 445-585 | `mail/useThreadActions.ts` | `flagThread` / `removeThread` / `moveThread` / `organize` / `recoverThread` |
| 586-653 | `mail/useMailAi.ts` | `askScan` / `runScan` / `runThreadAi`（候选确认面板数据） |
| 654-760 | `mail/useBodyPrefetch.ts` | `fillBodies`（补正文）+ 待修复计数 |
| 188-192 | `mail/useMailUi.ts` | `readerIndex` / `scanAsk` / `scheduleOpen` |
| 259-311 | 各 hook 内的 `useEffect` | 启动自愈 `healThreads`、版本号刷新、事件去抖 |

### 7.3 视图骨架

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 776-960 | `mail/components/MailToolbar.tsx` | 标题 / 搜索 / 未读筛选 / 补正文 / 全部同步 / 添加邮箱 / 关闭 / AI 扫描 |
| 960-1075 | `mail/components/AccountRail.tsx` | 第一栏：账号（可折叠）+ 文件夹树 + 未读徽标 + 右键菜单 + 实时接收状态点 |
| 1075-1205 | `mail/components/ThreadList.tsx` | 第二栏：会话行（头像/参与人/封数/摘要/星标）+ 右键 |
| 1205-1318 | `mail/components/ThreadView.tsx` | 第三栏：会话内邮件堆叠 + 工具栏（标记未读/AI 识别/待确认/重算） + 空态兜底 |
| 余下 | `MailDock.tsx` | 三栏布局组合 + `MessageReader` 挂载 |

验收：`MailDock.tsx` ≤200 行；每个 hook ≤120 行；`format.ts` 无 React import。
风险最高：拆分时**保持 effect 顺序**（自愈 → 列表加载 → 版本刷新），否则会出现"打开面板列表空"的旧故障复现。

---

## 8. `modules/calendar/service.ts`（572 行）

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 6-80 | `calendar/types.ts` | `EventRow/OverrideRow/Occurrence/NewEventInput/EventPatch/EventTarget` |
| 82-220 | `calendar/occurrence.ts` | `overlaps`、`toOccurrence`、`occurrenceAt`、`overrideToOccurrence`、`parseUntil`、`rruleToOptions`、`expandRecurring` |
| 222-284 | `calendar/occurrence.ts` | `listOccurrences` |
| 286-320 | `calendar/crud.ts` | `createEvent` |
| 321-377 | `calendar/edits.ts` | `toSqlValue`、`stringify`、`recordEdits`、`diffPatch` |
| 378-500 | `calendar/crud.ts` | `updateEvent` |
| 502-520 | `calendar/crud.ts` | `deleteEvent` |
| 522-535 | `calendar/crud.ts` | `reassignCategory` |
| 537-572 | `calendar/freeSlots.ts` | `FreeSlotOptions/FreeSlot/findFreeSlots` |
| — | `calendar/service.ts` | barrel：`export * from "./types" | "./occurrence" | "./crud" | "./freeSlots"` |

---

## 9. `modules/mail/service.ts`（1,232 行）

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 16-89 | `mail/service/presets.ts` | `MAIL_PRESETS`、`presetOf` |
| 91-179 | `mail/service/types.ts` | `MailAccount/MailFolder/MailMessage/MailAttachment/NewAccountInput` 等 |
| 180-324 | `mail/service/imap.ts` | Rust 命令封装：`testConnection`、`fetchHeaders`、`fetchBody`、`saveAttachment`、`setFlagsRemote`、`moveRemote`、`rustConfigOf` |
| 326-373 | `mail/service/rowMappers.ts` | 行 → 领域对象（内部） |
| 374-506 | `mail/service/accounts.ts` | `listAccounts` / `getAccount` / `addAccount` / `updateAccount` / `deleteAccount` / `setAccountSyncResult` |
| 508-615 | `mail/service/folders.ts` | `listFolders` / `getFolder` / `upsertFolders` / `updateFolderStats` / `resetFolderMessages` |
| 617-779 | `mail/service/messages.ts` | `upsertHeaders`、`totalUnread` |
| 781-999 | `mail/service/threads.ts` | `recomputeThreads`、`listThreads`、`listThreadMessages`、`threadIdOfMessage`、`healThreads`、`MailThread` |
| 1001-1167 | `mail/service/bodies.ts` | `applyFlagsLocal`、`removeMessagesLocal`、`prefetchBodies`、`countMissingBodies`、`looksLikeMojibake`、`countBadBodies`、`repairBodies` |
| 1169-1250 | `mail/service/messages.ts` | `listMessages`、`getMessage`、`saveMessageBody`、`folderCounts`、`countAccountMessages` |
| — | `mail/service.ts` | barrel：`export *` 上述文件 |

注意：`rowMappers.ts` 被多个文件共用 → 保持内部（不写进 barrel 的公开面）。

---

## 10. `modules/scout/service.ts`（629 行）

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 11-177 | `scout/service/types.ts` | 全部类型与 `CAMPUS_SORT_OPTIONS`、`isCampusSortKey`、`DEFAULT_SORT` |
| 178-245 | `scout/service/rows.ts` | `CAMPUS_COLS`、`toRecruit`、`splitValues` |
| 246-470 | `scout/service/query.ts` | `escapeLike`、`buildOrderBy`、`buildWhere`、`listCampusRecruits`、`countCampusRecruits`、`listCampusCompanies`、`campusStats`、`campusFacets` |
| 472-645 | `scout/service/upsert.ts` | `upsertCampusRecruits`（40 行/批）、`deleteCampusRecruit`、`backfillDeadlineIso`、`deleteAllCampusRecruits` |
| — | `scout/service.ts` | barrel |

---

## 11. `modules/jobs/service.ts`（190 行）

| 源区段 | 目标文件 | 内容 |
|---|---|---|
| 35-90 | `jobs/search.ts` | `jobHaystack`、`matchJob`、`filterJobs`（纯函数，无头可测） |
| 92-190 | `jobs/service.ts` | CRUD + `reassignJobStatus`（再 `export * from "./search"`） |

---

## 12. 附带修复（不改变行为，但消除循环依赖）

| 问题 | 处理 |
|---|---|
| `stores/uiStore.ts` import `modules/calendar/components/EventDialog` 的 `DialogState` | 把 `DialogState` 移到 `modules/calendar/types.ts`，组件与 store 都从类型文件取 |
| `calendarStore` 依赖 `modules/calendar/service` 的 6 个类型 | 改为从 `calendar/types.ts` 取（barrel 仍导出同名类型，兼容） |
| 模块内 store 与全局 store 并存 | 约定：**页面态进模块 `useXxxStore`（`modules/<m>/store.ts`），跨模块态留 `stores/`**（ui/theme/settings/chat 保持不动） |

---

## 13. 落地顺序（每步 `npx tsc --noEmit` + `npm run build`）

1. `shell/` 拆分（App.tsx）+ `workbench.ts`/`commands.ts` 去重 —— 无业务改动。
2. 叶子纯函数：`scout/format.ts`、`jobs/format.ts`、`chat/format.ts`、`mail/format.ts`。
3. service 拆 barrel：calendar → jobs → scout → mail（导入路径不变）。
4. 页面：scout → jobs → chat → settings → mail（由小到大）。
5. 收尾：防御代码收敛（ARCHITECTURE §5）、`CONTEXT.md` 结构章节同步。

回滚策略：每步保持 `service.ts` / `index.ts` barrel 与旧导出名 → 任一步构建失败可只回滚该步文件，不影响其它阶段。
