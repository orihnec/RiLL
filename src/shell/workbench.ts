import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
  Briefcase,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Download,
  Library,
  Mail,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { AppView } from "../stores/uiStore";
import { useJobImportStore } from "../modules/jobs/import/store";
import { openInterviews } from "../modules/interviews";

/**
 * ★ 工作台注册表：主区视图的唯一事实来源。
 *
 * 一次登记，四处生效 —— 顶部视图组、侧边栏入口、Cmd+K 命令、主区渲染。
 * 新增工作台 = 这里加一条（+ uiStore 的 AppView 联合类型加一项），
 * 不需要再同时改 TopBar / Sidebar / App / main。
 */
export interface WorkbenchEntry {
  id: AppView;
  /** 顶部视图组按钮文字 */
  label: string;
  /** 顶部左侧标题 / 侧边栏文案 */
  title: string;
  icon: LucideIcon;
  /** Cmd+K 搜索关键字 */
  keywords: string[];
  /** 侧边栏悬停提示 */
  hint: string;
  /** 侧边栏排序位（数字小的在上） */
  sidebarRank: number;
  /** 该入口不出现在 rail（例如设置用底部齿轮进） */
  hideInRail?: boolean;
  /** 懒加载视图（重组件走分包） */
  Component: LazyExoticComponent<ComponentType>;
  actions?: { id: string; label: string; icon: LucideIcon; run: () => void }[];
}

const SettingsView = lazy(() =>
  import("./SettingsDialog").then((m) => ({ default: m.SettingsView })),
);
const ChatView = lazy(() =>
  import("./chat/ChatView").then((m) => ({ default: m.ChatView })),
);
const JobsBoard = lazy(() =>
  import("../modules/jobs/components/JobCenterView").then((m) => ({ default: m.JobCenterView })),
);
const MailView = lazy(() =>
  import("../modules/mail/components/MailView").then((m) => ({ default: m.MailView })),
);
const KbView = lazy(() =>
  import("../modules/knowledge/components/KbView").then((m) => ({ default: m.KbView })),
);
const TodoView = lazy(() =>
  import("../modules/todo/components/TodoView").then((m) => ({ default: m.TodoView })),
);

/** 主区工作台（不含日历：日历另有周/月两种模式）。 */
export const WORKBENCH: WorkbenchEntry[] = [
  {
    id: "settings",
    label: "设置",
    title: "设置",
    icon: Settings,
    keywords: ["设置", "api", "key", "model", "模型", "供应商", "settings"],
    hint: "设置（模型 / 联网搜索 / 记忆 / 提醒 / 快捷键 / 数据）",
    sidebarRank: 90,
    hideInRail: true,
    Component: SettingsView,
  },
  {
    id: "chat",
    label: "AI",
    title: "AI 助手",
    icon: Sparkles,
    keywords: ["ai", "助手", "对话", "聊天", "chat"],
    hint: "AI 助手（对话 · 工具调用 · 会话历史）",
    sidebarRank: 5,
    Component: ChatView,
  },
  {
    id: "jobs",
    label: "求职",
    title: "求职中心",
    icon: Briefcase,
    keywords: ["求职", "投递", "jobs", "offer", "面试", "面经", "复盘", "校招", "信息库", "scout", "抓取"],
    hint: "求职中心（准备投递 · 已投递 · 面经 · 校招信息库）",
    sidebarRank: 10,
    Component: JobsBoard,
    actions: [{ id: "jobs.importFeishu", label: "从飞书导入", icon: Download,
      run: () => useJobImportStore.getState().openDialog() },
      { id: "jobs.recordInterview", label: "记录面经", icon: BookOpen, run: () => openInterviews(undefined, true) }],
  },
  {
    id: "todo",
    label: "待办",
    title: "待办",
    icon: CheckSquare,
    keywords: ["待办", "todo", "清单", "任务"],
    hint: "待办（可与日程绑定）",
    sidebarRank: 20,
    Component: TodoView,
  },
  {
    id: "mail",
    label: "邮箱",
    title: "邮箱",
    icon: Mail,
    keywords: ["邮箱", "邮件", "mail", "imap", "收件箱"],
    hint: "邮箱（IMAP 读信 · 本地保存 · 实时接收）",
    sidebarRank: 30,
    Component: MailView,
  },
  {
    id: "kb",
    label: "知识库",
    title: "知识库",
    icon: Library,
    keywords: ["知识库", "kb", "笔记", "markdown"],
    hint: "知识库（本地 Markdown 检索与编辑）",
    sidebarRank: 40,
    Component: KbView,
  },
];

export const WORKBENCH_BY_ID = new Map<AppView, WorkbenchEntry>(WORKBENCH.map((e) => [e.id, e]));

/** 侧边栏顺序（sidebarRank 升序）。 */
export const WORKBENCH_IN_SIDEBAR = [...WORKBENCH]
  .filter((w) => !w.hideInRail)
  .sort((a, b) => a.sidebarRank - b.sidebarRank);

/** 日历入口（不是 WORKBENCH 条目：它带周/月两种模式，由 TopBar 的段落控件切换）。 */
export const CALENDAR_ENTRY = {
  id: "calendar" as AppView,
  title: "日历",
  icon: CalendarDays,
  hint: "日历（周 / 月视图）",
};

/** 侧边栏「工作台」分组的全部入口：日历 + 各工作台。 */
export const NAV_ENTRIES: { id: AppView; title: string; icon: LucideIcon; hint: string }[] = [
  CALENDAR_ENTRY,
  ...WORKBENCH_IN_SIDEBAR.map((w) => ({ id: w.id, title: w.title, icon: w.icon, hint: w.hint })),
];

// 说明：这里以前还有一个 PANELS（弹层入口）。邮箱/知识库/设置都升成工作台条目后它空了，
// 而它留下的 `app.openSettings` 会和 WORKBENCH 派生出的同名命令冲突（duplicate command）——
// 已整体删除。新增入口一律加进 WORKBENCH。

/** 顶部的日历模式按钮（周 / 月）。 */
export const CALENDAR_MODES: { id: "week" | "month"; label: string }[] = [
  { id: "week", label: "周" },
  { id: "month", label: "月" },
];
