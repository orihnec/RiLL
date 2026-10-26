import { create } from "zustand";
import type { DialogState } from "../modules/calendar/components/EventDialog";

/** 主区工作台视图：日历（周/月）、求职中心、邮箱、知识库、待办。 */
export type AppView = "calendar" | "chat" | "jobs" | "mail" | "kb" | "settings" | "todo";

/** 求职中心内部页签。 */
export type JobTab = "preparing" | "applied" | "interviews" | "scout";

/** 应用级 UI 状态（工作台视图 / 设置弹层 / 命令栏 / 全局新建事件对话框）。 */
interface UiState {
  appView: AppView;
  /** 求职中心的当前页签（准备投递 / 已投递 / 面经 / 信息库） */
  jobTab: JobTab;
  paletteOpen: boolean;
  /** 习惯（每天固定安排）弹窗 */
  habitsOpen: boolean;
  createDialog: DialogState;
  /** 关闭确认弹窗（点击标题栏关闭 / Alt+F4 触发，默认最小化到托盘） */
  closeDialogOpen: boolean;
  /** 类别管理弹窗（侧边栏「类别」进入） */
  categoryManagerOpen: boolean;
  setAppView: (v: AppView) => void;
  setJobTab: (t: JobTab) => void;
  setPaletteOpen: (v: boolean) => void;
  setHabitsOpen: (v: boolean) => void;
  openCreateDialog: (defaultStart?: number, defaultEnd?: number) => void;
  closeCreateDialog: () => void;
  setCloseDialogOpen: (v: boolean) => void;
  setCategoryManagerOpen: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  appView: "calendar",
  jobTab: "preparing",
  paletteOpen: false,
  habitsOpen: false,
  createDialog: { open: false, mode: "create" },
  closeDialogOpen: false,
  categoryManagerOpen: false,

  setAppView: (appView) => set({ appView }),
  setJobTab: (jobTab) => set({ jobTab }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setHabitsOpen: (habitsOpen) => set({ habitsOpen }),
  openCreateDialog: (defaultStart, defaultEnd) =>
    set({ createDialog: { open: true, mode: "create", defaultStart, defaultEnd } }),
  closeCreateDialog: () => set((s) => ({ createDialog: { ...s.createDialog, open: false } })),
  setCloseDialogOpen: (closeDialogOpen) => set({ closeDialogOpen }),
  setCategoryManagerOpen: (categoryManagerOpen) => set({ categoryManagerOpen }),
}));
