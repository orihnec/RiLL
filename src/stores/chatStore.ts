import { create } from "zustand";

/** Agent 会话状态（M2 由 useChat 驱动填充）。 */
interface ChatState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
