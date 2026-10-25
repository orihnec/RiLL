import { create } from "zustand";

/**
 * 校招信息库数据版本号：AI 工具（scout_refresh/clear/delete）修改数据后 bump，
 * ScoutView 订阅 version 变化即时刷新——解决"聊天里抓取/删除后页面不同步"。
 */
interface ScoutState {
  version: number;
  bump: () => void;
}

export const useScoutStore = create<ScoutState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
