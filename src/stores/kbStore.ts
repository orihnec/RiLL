import { create } from "zustand";

/** 知识库状态（M3 填充）。 */
interface KbState {
  rootPath: string | null;
  setRootPath: (p: string | null) => void;
}

export const useKbStore = create<KbState>((set) => ({
  rootPath: null,
  setRootPath: (rootPath) => set({ rootPath }),
}));
