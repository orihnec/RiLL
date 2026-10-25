import { create } from "zustand";
import { getDb } from "../kernel/db";
import { getPassword, setPassword, deletePassword } from "tauri-plugin-keyring-api";

/** 供应商协议：openai-compatible（任意兼容端点，chat/completions）| responses（OpenAI 官方 API） */
export type ProviderProtocol = "openai-compatible" | "responses";

/** 一个 LLM API 端点（供应商）。key 只存内存，落盘走系统钥匙串。 */
export interface LlmProvider {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  /** 模型列表缓存（null = 尚未拉取/拉取失败） */
  models: string[] | null;
  /** 仅内存持有，落盘走系统钥匙串（user = llm-api-key:{id}） */
  apiKey: string;
  apiKeySet: boolean;
}

interface SettingsState {
  providers: LlmProvider[];
  /** 当前生效的供应商（聊天/命令栏用） */
  activeProviderId: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  /** 新增供应商（可同时保存 key）；返回新供应商。 */
  addProvider: (input: {
    name: string;
    baseUrl: string;
    apiKey?: string;
    protocol?: ProviderProtocol;
  }) => Promise<LlmProvider>;
  /** 持久化非敏感配置（name/baseURL/协议/模型/模型缓存） */
  updateProvider: (
    id: string,
    patch: Partial<
      Pick<LlmProvider, "name" | "protocol" | "baseUrl" | "chatModel" | "embeddingModel" | "models">
    >,
  ) => void;
  removeProvider: (id: string) => Promise<void>;
  setActiveProvider: (id: string) => void;
  saveApiKey: (id: string, key: string) => Promise<void>;
  clearApiKey: (id: string) => Promise<void>;
}

const KEYRING_SERVICE = "com.riliagent.app";
/** 旧版单 key 的钥匙串用户名（迁移用） */
const KEYRING_USER_LEGACY = "llm-api-key";
/** 多供应商版：每个供应商一个钥匙串条目 */
const keyringUser = (id: string) => `llm-api-key:${id}`;

async function persistField(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value],
  );
}

function rowToProvider(r: {
  id: string;
  name: string;
  protocol: string | null;
  base_url: string;
  chat_model: string;
  embedding_model: string;
  models_json: string | null;
  api_key: string;
}): LlmProvider {
  return {
    id: r.id,
    name: r.name,
    protocol: r.protocol === "responses" ? "responses" : "openai-compatible",
    baseUrl: r.base_url,
    chatModel: r.chat_model,
    embeddingModel: r.embedding_model,
    models: r.models_json ? (JSON.parse(r.models_json) as string[]) : null,
    apiKey: r.api_key,
    apiKeySet: r.api_key !== "",
  };
}

/** 读取全部供应商（含钥匙串 key）。 */
async function loadProviders(): Promise<LlmProvider[]> {
  const db = getDb();
  const rows = await db.select<
    {
      id: string;
      name: string;
      protocol: string | null;
      base_url: string;
      chat_model: string;
      embedding_model: string;
      models_json: string | null;
    }[]
  >(
    "SELECT id, name, protocol, base_url, chat_model, embedding_model, models_json FROM llm_providers ORDER BY created_at ASC",
  );
  const out: LlmProvider[] = [];
  for (const r of rows) {
    let apiKey = "";
    try {
      apiKey = (await getPassword(KEYRING_SERVICE, keyringUser(r.id))) ?? "";
    } catch (e) {
      console.warn(`[settings] keyring read failed for ${r.id}`, e);
    }
    out.push(rowToProvider({ ...r, api_key: apiKey }));
  }
  return out;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  providers: [],
  activeProviderId: null,
  loaded: false,

  load: async () => {
    try {
      const db = getDb();
      const rows = await db.select<{ key: string; value: string }[]>(
        "SELECT key, value FROM app_settings",
      );
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      let providers = await loadProviders();

      // 旧版单配置迁移：app_settings 里有 baseUrl（或钥匙串有旧 key）且还没有任何供应商
      // → 收编为一条「默认」供应商，并把旧 key 迁到新钥匙串用户名后清理。
      if (providers.length === 0 && (map.baseUrl || map.chatModel)) {
        const id = crypto.randomUUID();
        let legacyKey = "";
        try {
          legacyKey = (await getPassword(KEYRING_SERVICE, KEYRING_USER_LEGACY)) ?? "";
        } catch (e) {
          console.warn("[settings] legacy keyring read failed", e);
        }
        if (legacyKey) {
          try {
            await setPassword(KEYRING_SERVICE, keyringUser(id), legacyKey);
            await deletePassword(KEYRING_SERVICE, KEYRING_USER_LEGACY);
          } catch (e) {
            console.warn("[settings] legacy key migration failed", e);
          }
        }
        const now = Date.now();
        await db.execute(
          `INSERT INTO llm_providers (id, name, base_url, chat_model, embedding_model, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, "默认", map.baseUrl ?? "", map.chatModel ?? "", map.embeddingModel ?? "", now, now],
        );
        providers = await loadProviders();
        // 旧字段清理（避免重复迁移）
        void persistField("baseUrl", "").catch(console.warn);
        void persistField("chatModel", "").catch(console.warn);
        void persistField("embeddingModel", "").catch(console.warn);
      }

      let activeProviderId: string | null = map.active_provider_id ?? null;
      if (activeProviderId && !providers.some((p) => p.id === activeProviderId)) {
        activeProviderId = null;
      }
      if (!activeProviderId && providers.length > 0) {
        activeProviderId = providers[0].id;
        void persistField("active_provider_id", activeProviderId).catch(console.warn);
      }
      set({ providers, activeProviderId, loaded: true });
    } catch (e) {
      console.error("[settings] load failed", e);
      set({ loaded: true });
    }
  },

  addProvider: async ({ name, baseUrl, apiKey, protocol }) => {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = Date.now();
    await db.execute(
      `INSERT INTO llm_providers (id, name, protocol, base_url, chat_model, embedding_model, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '', '', $5, $5)`,
      [id, name.trim() || "未命名", protocol ?? "openai-compatible", baseUrl.trim(), now],
    );
    let key = "";
    if (apiKey && apiKey.trim()) {
      try {
        await setPassword(KEYRING_SERVICE, keyringUser(id), apiKey.trim());
        key = apiKey.trim();
      } catch (e) {
        console.error("[settings] keyring write failed", e);
        throw e;
      }
    }
    const provider: LlmProvider = {
      id,
      name: name.trim() || "未命名",
      protocol: protocol ?? "openai-compatible",
      baseUrl: baseUrl.trim(),
      chatModel: "",
      embeddingModel: "",
      models: null,
      apiKey: key,
      apiKeySet: key !== "",
    };
    const s = get();
    set({
      providers: [...s.providers, provider],
      activeProviderId: s.activeProviderId ?? id,
    });
    if (!s.activeProviderId) {
      void persistField("active_provider_id", id).catch(console.warn);
    }
    return provider;
  },

  updateProvider: (id, patch) => {
    set((s) => ({
      providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
    if (patch.name !== undefined) {
      void persistProviderField(id, "name", patch.name).catch(console.warn);
    }
    if (patch.protocol !== undefined) {
      void persistProviderField(id, "protocol", patch.protocol).catch(console.warn);
    }
    if (patch.baseUrl !== undefined) {
      void persistProviderField(id, "base_url", patch.baseUrl).catch(console.warn);
    }
    if (patch.chatModel !== undefined) {
      void persistProviderField(id, "chat_model", patch.chatModel).catch(console.warn);
    }
    if (patch.embeddingModel !== undefined) {
      void persistProviderField(id, "embedding_model", patch.embeddingModel).catch(console.warn);
    }
    if (patch.models !== undefined) {
      void persistProviderField(id, "models_json", patch.models ? JSON.stringify(patch.models) : null).catch(
        console.warn,
      );
    }
  },

  removeProvider: async (id) => {
    const db = getDb();
    await db.execute("DELETE FROM llm_providers WHERE id = $1", [id]);
    try {
      await deletePassword(KEYRING_SERVICE, keyringUser(id));
    } catch (e) {
      console.warn("[settings] keyring delete failed", e);
    }
    const s = get();
    const providers = s.providers.filter((p) => p.id !== id);
    let activeProviderId = s.activeProviderId;
    if (activeProviderId === id) {
      activeProviderId = providers[0]?.id ?? null;
      void persistField("active_provider_id", activeProviderId ?? "").catch(console.warn);
    }
    set({ providers, activeProviderId });
  },

  setActiveProvider: (id) => {
    if (!get().providers.some((p) => p.id === id)) return;
    set({ activeProviderId: id });
    void persistField("active_provider_id", id).catch(console.warn);
  },

  saveApiKey: async (id, key) => {
    const k = key.trim();
    if (!k) return;
    try {
      await setPassword(KEYRING_SERVICE, keyringUser(id), k);
      set((s) => ({
        providers: s.providers.map((p) => (p.id === id ? { ...p, apiKey: k, apiKeySet: true } : p)),
      }));
    } catch (e) {
      console.error("[settings] keyring write failed", e);
      throw e;
    }
  },

  clearApiKey: async (id) => {
    try {
      await deletePassword(KEYRING_SERVICE, keyringUser(id));
    } catch (e) {
      console.warn("[settings] keyring delete failed", e);
    }
    set((s) => ({
      providers: s.providers.map((p) => (p.id === id ? { ...p, apiKey: "", apiKeySet: false } : p)),
    }));
  },
}));

async function persistProviderField(
  id: string,
  field: string,
  value: string | null,
): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE llm_providers SET ${field} = $1, updated_at = $2 WHERE id = $3`, [
    value,
    Date.now(),
    id,
  ]);
}

/** 当前生效的供应商（无则回退到第一个；用于聊天运行时读取）。 */
export function getActiveProvider(): LlmProvider | null {
  const s = useSettingsStore.getState();
  return (
    s.providers.find((p) => p.id === s.activeProviderId) ?? s.providers[0] ?? null
  );
}
