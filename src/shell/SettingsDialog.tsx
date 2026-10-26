import { useEffect, useState } from "react";
import { errMsg } from "../lib/error";
import { appDataDir } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";
import {
  Bell,
  Check,
  Database,
  Info,
  Keyboard,
  KeyRound,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useUiStore } from "../stores/uiStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettingsStore, type LlmProvider, type ProviderProtocol } from "../stores/settingsStore";
import { fetchAvailableModels, refreshProviderModels } from "../kernel/agent/runtime";
import { MemorySection } from "./MemorySection";
import { SearchSection } from "./SearchSection";
import { reminderLeadMinutes, setReminderLeadMinutes } from "../kernel/reminder";
import { getCloseBehavior, type CloseBehavior } from "../kernel/closeBehavior";
import { rememberCloseBehavior } from "./closeWindow";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "../lib/utils";

const PROTOCOL_LABEL: Record<ProviderProtocol, string> = {
  "openai-compatible": "OpenAI 兼容",
  responses: "Responses API",
};


/** 设置里的分区卡：和邮箱/求职中心的头部同一套语言（图标 + 标题 + 说明 + 细边框）。 */
function Section({
  icon,
  title,
  hint,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/8 bg-white/3 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-indigo-300/80">{icon}</span>
        <span className="text-xs font-semibold">{title}</span>
        {hint && <span className="truncate text-ui-10 text-muted-foreground/50">{hint}</span>}
        {action && <div className="ml-auto flex items-center gap-1.5">{action}</div>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** 单个供应商卡片：连接信息 + key + 测试连接自动识别模型。 */
function ProviderCard({ provider }: { provider: LlmProvider }) {
  const { activeProviderId, updateProvider, setActiveProvider, saveApiKey, clearApiKey, removeProvider } =
    useSettingsStore();
  const isActive = provider.id === activeProviderId;
  const [name, setName] = useState(provider.name);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [chatModel, setChatModel] = useState(provider.chatModel);
  const [embeddingModel, setEmbeddingModel] = useState(provider.embeddingModel);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // 供应商数据被外部更新（如模型缓存刷新）时同步本地状态
  useEffect(() => {
    setName(provider.name);
    setBaseUrl(provider.baseUrl);
    setChatModel(provider.chatModel);
    setEmbeddingModel(provider.embeddingModel);
  }, [provider.name, provider.baseUrl, provider.chatModel, provider.embeddingModel]);

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const saveConfig = () => {
    updateProvider(provider.id, { name, baseUrl: baseUrl.trim(), chatModel: chatModel.trim(), embeddingModel: embeddingModel.trim() });
    flash();
  };

  /** 点选模型芯片：立即写入并持久化（聊天立刻生效）。 */
  const pickModel = (m: string) => {
    setChatModel(m);
    updateProvider(provider.id, { chatModel: m });
    flash();
  };

  const saveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    setKeyError(null);
    try {
      await saveApiKey(provider.id, apiKeyInput);
      setApiKeyInput("");
    } catch (e) {
      setKeyError(String(e));
    } finally {
      setSavingKey(false);
    }
  };

  /** 测试连接并拉取模型列表（自动识别模型）。 */
  const testConnection = async () => {
    if (!baseUrl.trim() || !provider.apiKeySet) {
      setTestError("请先填写 Base URL 并保存 API Key");
      return;
    }
    setTesting(true);
    setTestError(null);
    try {
      // 用当前输入框里的 baseUrl 测试，成功后一并保存
      const list = await fetchAvailableModels(baseUrl.trim(), provider.apiKey);
      updateProvider(provider.id, { baseUrl: baseUrl.trim(), models: list });
      if (list.length === 1) {
        setChatModel(list[0]);
        updateProvider(provider.id, { chatModel: list[0] });
      }
    } catch (e) {
      setTestError(errMsg(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-white/8 bg-white/3 p-3">
      {/* 头部：名称 + 当前标记 + 设为当前 + 删除 */}
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 flex-1 font-medium"
          placeholder="供应商名称（如 DeepSeek / OpenAI）"
        />
        {isActive ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-indigo-400/30 bg-indigo-400/15 px-2 py-0.5 text-ui-10 text-indigo-200">
            <Star className="size-2.5" /> 当前
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveProvider(provider.id)}
            title="设为当前供应商（聊天默认使用）"
            className="shrink-0"
          >
            设为当前
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (confirmDel) {
              void removeProvider(provider.id);
            } else {
              setConfirmDel(true);
              setTimeout(() => setConfirmDel(false), 2500);
            }
          }}
          className={cn("shrink-0", confirmDel && "bg-red-500/20 text-red-300")}
          title="删除该 API"
        >
          {confirmDel ? <span className="text-ui-10">确认删除？</span> : <Trash2 className="size-3.5" />}
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">API Base URL</Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <Label className="text-xs">协议</Label>
          <Select
            value={provider.protocol}
            onValueChange={(v) => {
              updateProvider(provider.id, { protocol: v as ProviderProtocol });
              setBaseUrl(v === "responses" ? "https://api.openai.com/v1" : baseUrl);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROTOCOL_LABEL) as ProviderProtocol[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PROTOCOL_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 text-ui-10 leading-relaxed text-muted-foreground/60">
          {provider.protocol === "responses"
            ? "OpenAI 官方 API（含原生推理/搜索能力），模型填 gpt-5 系列"
            : "任意兼容端点（DeepSeek / Ollama / 中转等）"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">对话模型</Label>
          <Input
            value={chatModel}
            onChange={(e) => setChatModel(e.target.value)}
            placeholder="gpt-4o-mini"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Embedding 模型（M3 用）</Label>
          <Input
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            placeholder="text-embedding-3-small"
          />
        </div>
      </div>

      {/* 模型列表：点选立即生效 */}
      {provider.models && provider.models.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {provider.models.map((m) => (
            <button
              key={m}
              onClick={() => pickModel(m)}
              className={cn(
                "rounded-md border px-2 py-0.5 font-mono text-ui-11 transition",
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

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void testConnection()} disabled={testing}>
          {testing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          {testing ? "连接中…" : "测试连接并获取模型"}
        </Button>
        <Button size="sm" variant="outline" onClick={saveConfig}>
          保存配置
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald-300">
            <Check className="size-3" /> 已保存
          </span>
        )}
      </div>
      {testError && <p className="text-xs text-red-400">{testError}</p>}
      {provider.models && (
        <p className="flex items-center gap-1 text-xs text-emerald-300">
          <Check className="size-3" /> 连接成功（{provider.models.length} 个模型，点选模型立即生效）
        </p>
      )}

      {/* API Key */}
      <div className="flex items-end gap-2 border-t border-white/6 pt-2.5">
        <div className="flex flex-1 flex-col gap-1">
          <Label className="text-xs">API Key</Label>
          <Input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={provider.apiKeySet ? "已保存（输入新值可替换）" : "sk-…"}
          />
        </div>
        <Button size="sm" onClick={() => void saveKey()} disabled={!apiKeyInput.trim() || savingKey}>
          {savingKey ? "保存中…" : "保存 Key"}
        </Button>
        {provider.apiKeySet && (
          <Button size="sm" variant="ghost" onClick={() => void clearApiKey(provider.id)} title="清除已保存的 Key">
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      {keyError && <p className="text-xs text-red-400">{keyError}</p>}
    </div>
  );
}

/** 添加 API 内联表单。 */
function AddProviderForm() {
  const { addProvider, providers } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [protocol, setProtocol] = useState<ProviderProtocol>("openai-compatible");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!baseUrl.trim()) {
      setError("请填写 API Base URL");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const p = await addProvider({ name, baseUrl, apiKey, protocol });
      setOpen(false);
      setName("");
      setBaseUrl("");
      setApiKey("");
      setProtocol("openai-compatible");
      // 已填 Key：添加后立即自动识别模型（聊天面板立即可选）
      if (p.apiKeySet) void refreshProviderModels(p.id).catch(() => undefined);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {open ? (
        <div className="flex flex-col gap-2.5 rounded-xl border border-indigo-400/25 bg-indigo-400/5 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称（如 DeepSeek）" />
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="Base URL，如 https://api.deepseek.com/v1" />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={protocol}
              onValueChange={(v) => setProtocol(v as ProviderProtocol)}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROTOCOL_LABEL) as ProviderProtocol[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROTOCOL_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API Key（可选，保存到系统钥匙串）"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void submit()} disabled={busy}>
              {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
              {busy ? "添加中…" : "添加"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="self-start">
          <Plus className="size-3" /> 添加 API
        </Button>
      )}
      {providers.length === 0 && (
        <p className="text-ui-11 text-muted-foreground/60">
          还没有配置任何 API。添加后可在聊天面板直接选择供应商与模型。
        </p>
      )}
    </div>
  );
}

/** 设置（**一级页面**）：多 API 接入 + 联网搜索 + 记忆 + 提醒 + 快捷键 + 数据位置。 */
export function SettingsView() {
  const { providers } = useSettingsStore();
  const [dbPath, setDbPath] = useState("");
  const [version, setVersion] = useState("");
  const [lead, setLead] = useState("10");
  const [leadSaved, setLeadSaved] = useState(false);
  const [closeBehavior, setCloseBehaviorState] = useState<CloseBehavior>("ask");

  useEffect(() => {
    void appDataDir()
      .then((p) => setDbPath(p))
      .catch(() => setDbPath("未知"));
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
    void reminderLeadMinutes().then((n) => setLead(String(n))).catch(() => setLead("10"));
    void getCloseBehavior().then(setCloseBehaviorState);
  }, []);

  const changeCloseBehavior = (v: CloseBehavior) => {
    setCloseBehaviorState(v);
    void rememberCloseBehavior(v);
  };

  const saveLead = async () => {
    const n = Number(lead);
    if (!Number.isFinite(n)) return;
    await setReminderLeadMinutes(Math.max(0, Math.min(120, n)));
    setLeadSaved(true);
    setTimeout(() => setLeadSaved(false), 1500);
  };

  const modKey = navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl";

  return (
    <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl">
      {/* 头部：与邮箱/求职中心同一套「图标 + 标题 + 说明 + 动作」 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/6 px-4 py-3">
        <SlidersHorizontal className="size-4 text-indigo-300" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">设置</div>
          <div className="truncate text-ui-10 text-muted-foreground/60">
            模型 · 联网搜索 · 记忆 · 提醒 · 快捷键 · 数据
          </div>
        </div>
        <button
          onClick={() => useUiStore.getState().setAppView("calendar")}
          title="回到日历"
          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm">

          {/* LLM 接入 */}
          <Section
            icon={<KeyRound className="size-3.5" />}
            title="LLM 接入"
            hint="任意 OpenAI 兼容端点 · Key 存系统钥匙串"
            action={
              providers.length > 0 ? (
                <span className="flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-ui-10 text-emerald-300">
                  <Check className="size-2.5" /> {providers.length}
                </span>
              ) : undefined
            }
          >
            {providers.map((p) => (
              <ProviderCard key={p.id} provider={p} />
            ))}
            <AddProviderForm />

            <p className="text-ui-11 text-muted-foreground/60">
              请求经原生层发出（不受浏览器 CORS 限制）；每个 API 可独立保存 Key 并自动识别模型，聊天面板可直接切换。
            </p>
          </Section>

          {/* 联网搜索（web_search 工具后端配置） */}
          <SearchSection />

          {/* 记忆与偏好（M4） */}
          <MemorySection />

          {/* 日程提醒 */}
          <Section
            icon={<Bell className="size-3.5" />}
            title="日程提醒"
            hint="提前 N 分钟发系统通知"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs">提前</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={lead}
                onChange={(e) => setLead(e.target.value)}
                className="h-7 w-20 text-xs"
              />
              <span className="text-xs text-muted-foreground/70">分钟（0 = 开始时）</span>
              <Button size="sm" variant="outline" onClick={() => void saveLead()} className="h-7 px-2 text-ui-11">
                {leadSaved ? <Check className="size-3 text-emerald-400" /> : "保存"}
              </Button>
            </div>
            <p className="text-ui-10 text-muted-foreground/50">
              应用运行期间生效（含最小化到托盘）；关闭主窗口后应用在托盘常驻，提醒照常发出。
            </p>
          </Section>

          <Section icon={<Power className="size-3.5" />} title="关闭窗口" hint="点 ✕ / Alt+F4 时的行为">
            <div className="flex flex-wrap gap-1.5">
              {([
                ["ask", "每次询问"],
                ["tray", "最小化到托盘"],
                ["quit", "直接退出"],
              ] as [CloseBehavior, string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => changeCloseBehavior(id)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-ui-11 transition",
                    closeBehavior === id
                      ? "border-indigo-400/50 bg-indigo-400/15 text-indigo-100"
                      : "border-white/10 bg-white/3 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-ui-10 text-muted-foreground/50">
              第一次关闭会让你选一次，之后按选的方式执行；这里可以随时改（选「每次询问」就会恢复每次弹框）。
            </p>
          </Section>
          {/* 快捷键 */}
          <Section icon={<Keyboard className="size-3.5" />} title="快捷键" hint="命令栏全局生效">
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
                  <kbd className="rounded-md border border-white/10 bg-white/6 px-1.5 py-0.5 font-mono text-ui-10 text-indigo-200">
                    {k}
                  </kbd>
                </div>
              ))}
            </div>
          </Section>

          {/* 数据 */}
          <Section icon={<Database className="size-3.5" />} title="数据" hint="单文件 SQLite · 纯本地">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white/4 px-2.5 py-1.5 text-xs">
              <span className="shrink-0 text-foreground/75">数据库目录</span>
              <span className="truncate font-mono text-ui-10 text-muted-foreground">{dbPath || "…"}</span>
            </div>
            <div className="rounded-lg bg-white/4 px-2.5 py-1.5 text-ui-11 text-muted-foreground/70">
              备份 = 复制该目录下的 riliagent.db
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/4 px-2.5 py-1.5 text-xs">
              <span className="text-foreground/75">版本</span>
              <span className="font-mono text-ui-10 text-muted-foreground">{version || "…"}</span>
            </div>
          </Section>

          <p className="flex items-center gap-1.5 text-ui-11 text-muted-foreground/50">
            <Info className="size-3" /> 纯本地 · 单用户 · 无服务器端
          </p>
        </div>

        {/* 底部：统一成一条细栏 */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/6 px-4 py-2.5">
          <span className="text-ui-10 text-muted-foreground/50">改动即时生效，无需重启</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-ui-11"
            onClick={() => useUiStore.getState().setAppView("calendar")}
          >
            关闭
          </Button>
        </div>
      </div>
  );
}
