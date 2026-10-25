import { create } from "zustand";

/** 实时接收的状态（每个账号一条），由 watch.ts 写入、面板显示 */
export interface WatchInfo {
  /** idle（服务器推送）| poll（轮询）| "" */
  mode: string;
  /** ok | error | stopped */
  status: string;
  message: string;
  unseen: number;
}

/**
 * 邮箱面板 UI 状态：浮层开关 + 未读角标 + 数据版本号 + 实时接收状态。
 * 数据版本号用于「后台监听到了新邮件 / AI 工具改了数据 → 面板即时刷新」。
 */
interface MailState {
  open: boolean;
  /** 全部账号收件箱未读总数（侧边栏角标） */
  unreadTotal: number;
  version: number;
  watch: Record<string, WatchInfo>;
  setOpen: (open: boolean) => void;
  setUnreadTotal: (n: number) => void;
  bump: () => void;
  setWatch: (accountId: string, info: WatchInfo) => void;
  clearWatch: (accountId: string) => void;
}

export const useMailStore = create<MailState>((set) => ({
  open: false,
  unreadTotal: 0,
  version: 0,
  watch: {},
  setOpen: (open) => set({ open }),
  setUnreadTotal: (unreadTotal) => set({ unreadTotal }),
  bump: () => set((s) => ({ version: s.version + 1 })),
  setWatch: (accountId, info) => set((s) => ({ watch: { ...s.watch, [accountId]: info } })),
  clearWatch: (accountId) =>
    set((s) => {
      const next = { ...s.watch };
      delete next[accountId];
      return { watch: next };
    }),
}));
