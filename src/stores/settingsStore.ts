import { create } from "zustand";

/** LLM 配置（M2 由 stronghold/keyring 持久化）。 */
export interface LlmSettings {
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  apiKeySet: boolean;
}

interface SettingsState {
  llm: LlmSettings;
  setLlm: (patch: Partial<LlmSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  llm: {
    baseUrl: "",
    chatModel: "",
    embeddingModel: "",
    apiKeySet: false,
  },
  setLlm: (patch) => set((s) => ({ llm: { ...s.llm, ...patch } })),
}));
