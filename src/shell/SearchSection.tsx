import { useEffect, useState } from "react";
import { errMsg } from "../lib/error";
import { Check, Globe, KeyRound, Loader2, Search, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  loadSearchConfig,
  saveSearchConfig,
  saveSearchApiKey,
  clearSearchApiKey,
  testSearch,
  DEEPSEEK_SEARCH_BASE,
  DEEPSEEK_SEARCH_MODEL,
  type SearchProvider,
} from "../kernel/search";

const PROVIDER_LABEL: Record<SearchProvider, string> = {
  deepseek: "DeepSeek 原生搜索（推荐，官方内置）",
  wikipedia: "Wikipedia（免费，零配置）",
  tavily: "Tavily（需 API Key）",
  searxng: "SearXNG（自托管实例）",
};

/** 设置页「联网搜索」：后端选择 + key/baseURL + 测试。 */
export function SearchSection() {
  const [provider, setProvider] = useState<SearchProvider>("deepseek");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [keySet, setKeySet] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    void loadSearchConfig().then((cfg) => {
      setProvider(cfg.provider);
      setBaseUrl(cfg.baseUrl);
      setModel(cfg.model);
      setKeySet(cfg.apiKey !== "");
    });
  }, []);

  const changeProvider = (p: SearchProvider) => {
    setProvider(p);
    void saveSearchConfig({ provider: p });
    setTestResult(null);
  };

  const saveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    setKeyError(null);
    try {
      await saveSearchApiKey(apiKeyInput);
      setApiKeyInput("");
      setKeySet(true);
    } catch (e) {
      setKeyError(String(e));
    } finally {
      setSavingKey(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const r = await testSearch();
      setTestResult(`${PROVIDER_LABEL[r.provider]}：搜索成功（${r.count} 条结果）`);
    } catch (e) {
      setTestError(errMsg(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Globe className="size-3.5" /> 联网搜索
        <span className="text-[10px] font-normal text-muted-foreground/50">
          给 AI 提供实时信息（web_search 工具）
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-white/8 bg-white/3 p-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">搜索后端</Label>
          <Select value={provider} onValueChange={(v) => changeProvider(v as SearchProvider)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROVIDER_LABEL) as SearchProvider[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {provider === "deepseek" && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
              使用 DeepSeek 官方原生联网搜索（Anthropic 兼容接口 + web_search 工具，与官方 Harness 同款）。
              无需额外 Key——自动复用你在上方配置的 DeepSeek 供应商密钥。
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">接口地址（可选）</Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value);
                    void saveSearchConfig({ baseUrl: e.target.value });
                  }}
                  placeholder={DEEPSEEK_SEARCH_BASE}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">搜索模型（可选）</Label>
                <Input
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    void saveSearchConfig({ model: e.target.value });
                  }}
                  placeholder={DEEPSEEK_SEARCH_MODEL}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/50">
              留空使用默认值；如需独立 Key（不复用供应商），填在下方 Tavily 输入框旁的说明——或直接添加一个 DeepSeek 供应商。
            </p>
          </div>
        )}

        {provider === "tavily" && (
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label className="text-xs">Tavily API Key（tavily.com 免费注册）</Label>
              <Input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={keySet ? "已保存（输入新值可替换）" : "tvly-…"}
              />
            </div>
            <Button size="sm" onClick={() => void saveKey()} disabled={!apiKeyInput.trim() || savingKey}>
              {savingKey ? "保存中…" : "保存"}
            </Button>
            {keySet && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void clearSearchApiKey().then(() => setKeySet(false))}
                title="清除 Key"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        )}
        {keyError && <p className="text-xs text-red-400">{keyError}</p>}

        {provider === "searxng" && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs">SearXNG 实例地址（需启用 JSON 输出）</Label>
            <Input
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                void saveSearchConfig({ baseUrl: e.target.value });
              }}
              placeholder="http://127.0.0.1:8080"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void test()} disabled={testing}>
            {testing ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
            {testing ? "搜索中…" : "测试搜索"}
          </Button>
          {testResult && (
            <span className="flex items-center gap-1 text-xs text-emerald-300">
              <Check className="size-3" /> {testResult}
            </span>
          )}
        </div>
        {testError && <p className="text-xs text-red-400">{testError}</p>}
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
          <KeyRound className="size-3" /> Key 存系统钥匙串；请求经原生层发出（无 CORS 限制）。
          未配置时自动降级 Wikipedia 免费搜索。
        </p>
      </div>
    </section>
  );
}
