import { getDb } from "./db";
import { getPassword, setPassword, deletePassword } from "tauri-plugin-keyring-api";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useSettingsStore } from "../stores/settingsStore";

/**
 * 联网搜索后端抽象：
 * - deepseek（官方原生，推荐）：Anthropic 兼容 Messages API + 原生 web_search_20250305 工具（DSH 同款）
 * - tavily / searxng：通用网页搜索
 * - wikipedia：免费降级，零配置
 * 所有请求经 tauri-plugin-http 原生发出（不受 CORS 限制）。
 */

export type SearchProvider = "deepseek" | "wikipedia" | "tavily" | "searxng";

export interface SearchConfig {
  provider: SearchProvider;
  /** Tavily API key（钥匙串） */
  apiKey: string;
  /** SearXNG 实例 base URL / DeepSeek Anthropic base URL */
  baseUrl: string;
  /** DeepSeek 搜索模型（Anthropic 格式模型名） */
  model: string;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

const KEYRING_SERVICE = "com.riliagent.app";
const KEYRING_USER = "search-api-key";

/** DeepSeek 原生搜索默认端点（DSH 官方：/messages 会追加） */
export const DEEPSEEK_SEARCH_BASE = "https://api.deepseek.com/anthropic/v1";
export const DEEPSEEK_SEARCH_MODEL = "deepseek-v4-flash";

async function readField(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

async function writeField(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value],
  );
}

export async function loadSearchConfig(): Promise<SearchConfig> {
  const [provider, baseUrl, model, apiKey] = await Promise.all([
    readField("search_provider"),
    readField("search_base_url"),
    readField("search_model"),
    getPassword(KEYRING_SERVICE, KEYRING_USER).catch(() => null),
  ]);
  return {
    provider: (provider as SearchProvider) ?? "deepseek",
    baseUrl: baseUrl ?? "",
    model: model ?? "",
    apiKey: apiKey ?? "",
  };
}

export async function saveSearchConfig(
  patch: Partial<Pick<SearchConfig, "provider" | "baseUrl" | "model">>,
): Promise<void> {
  if (patch.provider !== undefined) await writeField("search_provider", patch.provider);
  if (patch.baseUrl !== undefined) await writeField("search_base_url", patch.baseUrl);
  if (patch.model !== undefined) await writeField("search_model", patch.model);
}

export async function saveSearchApiKey(key: string): Promise<void> {
  const k = key.trim();
  if (!k) return;
  await setPassword(KEYRING_SERVICE, KEYRING_USER, k);
}

export async function clearSearchApiKey(): Promise<void> {
  await deletePassword(KEYRING_SERVICE, KEYRING_USER).catch(() => undefined);
}

function timeout(ms: number, msg: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));
}

/* ---------------- 各后端实现 ---------------- */

async function searchTavily(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const res = await Promise.race([
    tauriFetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: Math.min(maxResults, 8),
        search_depth: "basic",
      }),
    }),
    timeout(15_000, "Tavily 请求超时"),
  ]);
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const json = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  return (json.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title ?? "", url: r.url as string, content: r.content ?? "" }));
}

async function searchSearxng(
  query: string,
  maxResults: number,
  baseUrl: string,
): Promise<SearchResult[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await Promise.race([
    tauriFetch(url, { headers: { Accept: "application/json" } }),
    timeout(15_000, "SearXNG 请求超时"),
  ]);
  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
  const json = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  return (json.results ?? [])
    .filter((r) => r.url)
    .slice(0, maxResults)
    .map((r) => ({ title: r.title ?? "", url: r.url as string, content: r.content ?? "" }));
}

async function searchWikipedia(query: string, maxResults: number): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrlimit: String(Math.min(maxResults, 6)),
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    format: "json",
    utf8: "1",
    origin: "*",
  });
  const res = await Promise.race([
    tauriFetch(`https://zh.wikipedia.org/w/api.php?${params.toString()}`),
    timeout(15_000, "Wikipedia 请求超时"),
  ]);
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const json = (await res.json()) as {
    query?: {
      pages?: Record<string, { title?: string; extract?: string; pageid?: number }>;
    };
  };
  const pages = Object.values(json.query?.pages ?? {});
  return pages
    .filter((p) => p.title)
    .map((p) => ({
      title: p.title as string,
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(p.title as string)}`,
      content: (p.extract ?? "").slice(0, 600),
    }));
}

/* ---------------- DeepSeek 原生搜索（DSH 同款：Anthropic Messages + web_search_20250305） ---------------- */

interface DsTextBlock {
  type: "text";
  text?: string;
  citations?: { url?: string; cited_text?: string }[];
}

interface DsSearchResultItem {
  type: "web_search_result";
  url: string;
  title?: string;
  page_age?: string;
}

interface DsToolResultBlock {
  type: "web_search_tool_result";
  content?: DsSearchResultItem[];
}

/**
 * 解析 DSH 同款响应：web_search_tool_result 块的条目为来源，
 * 摘要从 text 块的 citations（url → cited_text）关联，按 url 去重。
 */
function mapDeepseekResponse(payload: unknown): SearchResult[] {
  const blocks = (payload as { content?: unknown[] })?.content ?? [];
  const resultBlocks = blocks.filter(
    (b): b is DsToolResultBlock => (b as { type?: string }).type === "web_search_tool_result",
  );
  if (resultBlocks.length === 0) {
    throw new Error("DeepSeek 未返回搜索结果块（请求可能未触发原生搜索）");
  }
  const snippets = new Map<string, string>();
  for (const b of blocks) {
    if ((b as { type?: string }).type !== "text") continue;
    for (const cite of (b as DsTextBlock).citations ?? []) {
      if (cite.url && cite.cited_text && !snippets.has(cite.url)) snippets.set(cite.url, cite.cited_text);
    }
  }
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const block of resultBlocks) {
    for (const item of block.content ?? []) {
      if (item.url.length === 0 || seen.has(item.url)) continue;
      seen.add(item.url);
      out.push({
        title: item.title ?? item.url,
        url: item.url,
        content: snippets.get(item.url) ?? `（${item.page_age ?? "未知时间"}）`,
      });
    }
  }
  return out;
}

/** 解析 DeepSeek 搜索 key：专用 key → 当前供应商 → 任一 deepseek.com 供应商。 */
async function resolveDeepSeekKey(dedicated: string): Promise<string> {
  if (dedicated) return dedicated;
  const providers = useSettingsStore.getState().providers;
  const active = providers.find((p) => p.id === useSettingsStore.getState().activeProviderId);
  if (active?.apiKeySet && /deepseek/i.test(active.baseUrl)) return active.apiKey;
  const anyDs = providers.find((p) => p.apiKeySet && /deepseek/i.test(p.baseUrl));
  return anyDs?.apiKey ?? "";
}

async function searchDeepseekNative(
  query: string,
  maxResults: number,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<SearchResult[]> {
  const endpoint = `${(baseUrl || DEEPSEEK_SEARCH_BASE).replace(/\/+$/, "")}/messages`;
  const body = {
    model: model || DEEPSEEK_SEARCH_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: `Perform a web search for the query: ${query}` }],
      },
    ],
    // 官方原生搜索工具（Anthropic 兼容格式）
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: Math.min(maxResults, 5) }],
  };
  const res = await Promise.race([
    tauriFetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "x-api-key": apiKey,
        authorization: `Bearer ${apiKey}`,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    }),
    timeout(15_000, "DeepSeek 搜索请求超时"),
  ]);
  if (!res.ok) {
    let msg = `DeepSeek API error (HTTP ${res.status})`;
    try {
      const parsed = (await res.json()) as { error?: { message?: string } | string };
      const detail = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
      if (detail) msg = detail;
    } catch {
      // 保留 HTTP 状态信息
    }
    throw new Error(msg);
  }
  return mapDeepseekResponse(await res.json());
}

/* ---------------- 统一入口 ---------------- */

/**
 * 执行联网搜索。未配置可用后端时自动降级 Wikipedia。
 * 返回格式化后的结果列表（内容截断，控制 token 消耗）。
 */
export async function webSearch(
  query: string,
  maxResults = 5,
): Promise<{ results: SearchResult[]; provider: SearchProvider }> {
  const cfg = await loadSearchConfig();
  const q = query.trim();
  let results: SearchResult[];
  let used: SearchProvider = cfg.provider;
  switch (cfg.provider) {
    case "tavily":
      if (!cfg.apiKey) {
        results = await searchWikipedia(q, maxResults);
        used = "wikipedia";
      } else {
        results = await searchTavily(q, maxResults, cfg.apiKey);
      }
      break;
    case "searxng":
      if (!cfg.baseUrl) {
        results = await searchWikipedia(q, maxResults);
        used = "wikipedia";
      } else {
        results = await searchSearxng(q, maxResults, cfg.baseUrl);
      }
      break;
    case "deepseek": {
      // 原生搜索：自动复用 DeepSeek 供应商的 key（零额外配置）
      const key = await resolveDeepSeekKey(cfg.apiKey);
      if (!key) {
        results = await searchWikipedia(q, maxResults);
        used = "wikipedia";
      } else {
        results = await searchDeepseekNative(q, maxResults, key, cfg.baseUrl, cfg.model);
      }
      break;
    }
    default:
      results = await searchWikipedia(q, maxResults);
      used = "wikipedia";
  }
  return { results: results.slice(0, maxResults), provider: used };
}

/** 设置页"测试搜索"用：返回后端描述。 */
export async function testSearch(query = "Rill"): Promise<{ provider: SearchProvider; count: number }> {
  const { results, provider } = await webSearch(query, 3);
  return { provider, count: results.length };
}
