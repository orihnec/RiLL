import { create } from "zustand";
import { getDb } from "../kernel/db";
import { getPassword, setPassword, deletePassword } from "tauri-plugin-keyring-api";

export interface LlmSettings {
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  /** 仅内存持有，落盘走系统钥匙串 */
  apiKey: string;
  apiKeySet: boolean;
}

interface SettingsState {
  llm: LlmSettings;
  loaded: boolean;
  load: () => Promise<void>;
  /** 持久化非敏感配置（baseURL / 模型名）到 app_settings 表 */
  setLlm: (patch: Partial<Pick<LlmSettings, "baseUrl" | "chatModel" | "embeddingModel">>) => void;
  saveApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
}

const KEYRING_SERVICE = "com.riliagent.app";
const KEYRING_USER = "llm-api-key";

async function persistField(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value],
  );
}

export const useSettingsStore = create<SettingsState>((set) => ({
  llm: { baseUrl: "", chatModel: "", embeddingModel: "", apiKey: "", apiKeySet: false },
  loaded: false,

  load: async () => {
    try {
      const db = getDb();
      const rows = await db.select<{ key: string; value: string }[]>(
        "SELECT key, value FROM app_settings",
      );
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      let apiKey = "";
      try {
        apiKey = (await getPassword(KEYRING_SERVICE, KEYRING_USER)) ?? "";
      } catch (e) {
        console.warn("[settings] keyring read failed", e);
      }
      set({
        llm: {
          baseUrl: map.baseUrl ?? "",
          chatModel: map.chatModel ?? "",
          embeddingModel: map.embeddingModel ?? "",
          apiKey,
          apiKeySet: apiKey !== "",
        },
        loaded: true,
      });
    } catch (e) {
      console.error("[settings] load failed", e);
      set({ loaded: true });
    }
  },

  setLlm: (patch) => {
    set((s) => ({ llm: { ...s.llm, ...patch } }));
    void persistField("baseUrl", patch.baseUrl ?? "").catch(console.warn);
    void persistField("chatModel", patch.chatModel ?? "").catch(console.warn);
    void persistField("embeddingModel", patch.embeddingModel ?? "").catch(console.warn);
  },

  saveApiKey: async (key) => {
    const k = key.trim();
    if (!k) return;
    try {
      await setPassword(KEYRING_SERVICE, KEYRING_USER, k);
      set((s) => ({ llm: { ...s.llm, apiKey: k, apiKeySet: true } }));
    } catch (e) {
      console.error("[settings] keyring write failed", e);
      throw e;
    }
  },

  clearApiKey: async () => {
    try {
      await deletePassword(KEYRING_SERVICE, KEYRING_USER);
    } catch (e) {
      console.warn("[settings] keyring delete failed", e);
    }
    set((s) => ({ llm: { ...s.llm, apiKey: "", apiKeySet: false } }));
  },
}));
