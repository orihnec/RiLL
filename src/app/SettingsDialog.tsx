import { useEffect, useState } from "react";
import { appDataDir } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";
import { Check, Database, Info, Keyboard, KeyRound, Loader2, RefreshCw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettingsStore } from "../stores/settingsStore";
import { fetchAvailableModels } from "../kernel/agent/runtime";
import { cn } from "../lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 设置：LLM 接入（baseURL/模型持久化 + API key 存系统钥匙串）+ 快捷键 + 数据位置。 */
export function SettingsDialog({ open, onClose }: Props) {
  const { llm, setLlm, saveApiKey, clearApiKey } = useSettingsStore();
  const [dbPath, setDbPath] = useState("");
  const [version, setVersion] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setBaseUrl(llm.baseUrl);
    setChatModel(llm.chatModel);
    setEmbeddingModel(llm.embeddingModel);
    setApiKeyInput("");
    setSaved(false);
    setKeyError(null);
    setTestError(null);
    setModels(null);
    void appDataDir()
      .then((p) => setDbPath(p))
      .catch(() => setDbPath("未知"));
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveConfig = () => {
    setLlm({
      baseUrl: baseUrl.trim(),
      chatModel: chatModel.trim(),
      embeddingModel: embeddingModel.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const saveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    setKeyError(null);
    try {
      await saveApiKey(apiKeyInput);
      setApiKeyInput("");
    } catch (e) {
      setKeyError(String(e));
    } finally {
      setSavingKey(false);
    }
  };

  /** 测试连接并拉取模型列表（杜绝模型名填错）。 */
  const testConnection = async () => {
    if (!baseUrl.trim() || !llm.apiKeySet) {
      setTestError("请先填写 Base URL 并保存 API Key");
      return;
    }
    setTesting(true);
    setTestError(null);
    setModels(null);
    try {
      const list = await fetchAvailableModels(baseUrl.trim(), llm.apiKey);
      setModels(list);
      if (list.length === 1) setChatModel(list[0]);
    } catch (e) {
      setTestError(String(e instanceof Error ? e.message : e));
    } finally {
      setTesting(false);
    }
  };

  const modKey = navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription className="sr-only">应用设置</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-1 text-sm">
          {/* LLM 接入 */}
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <KeyRound className="size-3.5" /> LLM 接入
              {llm.apiKeySet && (
                <span className="flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300">
                  <Check className="size-2.5" /> Key 已保存（系统钥匙串）
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">API Base URL</Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">对话模型</Label>
                <Input
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Embedding 模型（M3 知识库检索用，可先留空）</Label>
              <Input
                value={embeddingModel}
                onChange={(e) => setEmbeddingModel(e.target.value)}
                placeholder="text-embedding-3-small"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void testConnection()} disabled={testing}>
                {testing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                {testing ? "连接中…" : "测试连接并获取模型"}
              </Button>
              {models && (
                <span className="flex items-center gap-1 text-xs text-emerald-300">
                  <Check className="size-3" /> 连接成功（{models.length} 个模型）
                </span>
              )}
            </div>
            {testError && <p className="text-xs text-red-400">{testError}</p>}
            {models && models.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {models.map((m) => (
                  <button
                    key={m}
                    onClick={() => setChatModel(m)}
                    className={cn(
                      "rounded-md border px-2 py-0.5 font-mono text-[11px] transition",
                      chatModel === m
                        ? "border-indigo-400/60 bg-indigo-400/15 text-indigo-200"
                        : "border-white/10 bg-white/4 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <Label className="text-xs">API Key</Label>
                <Input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={llm.apiKeySet ? "已保存（输入新值可替换）" : "sk-…"}
                />
              </div>
              <Button size="sm" onClick={() => void saveKey()} disabled={!apiKeyInput.trim() || savingKey}>
                {savingKey ? "保存中…" : "保存 Key"}
              </Button>
              {llm.apiKeySet && (
                <Button size="sm" variant="ghost" onClick={() => void clearApiKey()} title="清除已保存的 Key">
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
            {keyError && <p className="text-xs text-red-400">{keyError}</p>}
            <p className="text-[11px] text-muted-foreground/60">
              支持任意 OpenAI 兼容端点；请求经原生层发出（不受浏览器 CORS 限制）。
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={saveConfig}>
                保存配置
              </Button>
              {saved && (
                <span className="flex items-center gap-1 text-xs text-emerald-300">
                  <Check className="size-3" /> 已保存
                </span>
              )}
            </div>
          </section>

          {/* 快捷键 */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Keyboard className="size-3.5" /> 快捷键
            </div>
            <div className="flex flex-col gap-1 text-xs">
              {[
                [`${modKey}+K`, "命令栏 / AI（全局生效）"],
                [`${modKey}+N`, "新建事件"],
                [`${modKey}+1 / ${modKey}+2`, "切换 周 / 月 视图"],
                [`${modKey}+T`, "回到今天"],
                [`${modKey}+,`, "打开设置"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-lg bg-white/4 px-2.5 py-1.5"
                >
                  <span className="text-foreground/75">{v}</span>
                  <kbd className="rounded-md border border-white/10 bg-white/6 px-1.5 py-0.5 font-mono text-[10px] text-indigo-200">
                    {k}
                  </kbd>
                </div>
              ))}
            </div>
          </section>

          {/* 数据 */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Database className="size-3.5" /> 数据
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-white/4 px-2.5 py-1.5">
                <span className="shrink-0 text-foreground/75">数据库目录</span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {dbPath || "…"}
                </span>
              </div>
              <div className="rounded-lg bg-white/4 px-2.5 py-1.5 text-muted-foreground/70">
                备份 = 复制该目录下的 riliagent.db（单文件，纯本地）
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/4 px-2.5 py-1.5">
                <span className="text-foreground/75">版本</span>
                <span className="font-mono text-[10px] text-muted-foreground">{version || "…"}</span>
              </div>
            </div>
          </section>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <Info className="size-3" /> 纯本地 · 单用户 · 无服务器端
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
