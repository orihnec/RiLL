import { create } from "zustand";
import type { DialogState } from "../modules/calendar/components/EventDialog";

/** 应用级 UI 状态（设置弹层 / 命令栏 / 全局新建事件对话框）。 */
interface UiState {
  settingsOpen: boolean;
  paletteOpen: boolean;
  createDialog: DialogState;
  setSettingsOpen: (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;
  openCreateDialog: (defaultStart?: number, defaultEnd?: number) => void;
  closeCreateDialog: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  paletteOpen: false,
  createDialog: { open: false, mode: "create" },

  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  openCreateDialog: (defaultStart, defaultEnd) =>
    set({ createDialog: { open: true, mode: "create", defaultStart, defaultEnd } }),
  closeCreateDialog: () => set((s) => ({ createDialog: { ...s.createDialog, open: false } })),
}));
