import { useEffect, useState } from "react";
import { errMsg } from "../../../lib/error";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useUiStore } from "../../../stores/uiStore";
import { refreshProviderModels } from "../../../kernel/agent/runtime";
import { cn } from "../../../lib/utils";
import { useAnchoredMenu } from "../hooks/useAnchoredMenu";

/**
 * 模型选择器：直接切换供应商 + 模型（自动识别/缓存模型列表）。
 * 浮层定位与关闭逻辑在 useAnchoredMenu（portal 到 body，避开 .glass 定位地雷）。
 */
export function ModelPicker({ open, streaming }: { open: boolean; streaming: boolean }) {
  const providers = useSettingsStore((s) => s.providers);
  const activeProviderId = useSettingsStore((s) => s.activeProviderId);
  const setActiveProvider = useSettingsStore((s) => s.setActiveProvider);
  const updateProvider = useSettingsStore((s) => s.updateProvider);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const { menuOpen, setMenuOpen, pos, btnRef, menuRef, toggleMenu } = useAnchoredMenu({
    disabled: streaming,
  });

  const active = providers.find((p) => p.id === activeProviderId) ?? providers[0] ?? null;

  const doRefresh = async (id: string) => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshProviderModels(id);
    } catch (e) {
      setRefreshError(errMsg(e));
    } finally {
      setRefreshing(false);
    }
  };

  // 打开面板时自动识别模型：当前供应商有 key + baseURL 但没有模型缓存 → 拉一次
  useEffect(() => {
    if (!open) return;
    if (active && active.apiKeySet && active.baseUrl.trim() !== "" && !active.models) {
      void doRefresh(active.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active?.id, active?.apiKeySet]);

  const pick = (pid: string, model: string) => {
    setActiveProvider(pid);
    updateProvider(pid, { chatModel: model });
    setMenuOpen(false);
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      {active ? (
        <>
          <button
            ref={btnRef}
            onClick={toggleMenu}
            disabled={streaming}
            title={`${active.name} · ${active.chatModel || "选择模型"}`}
            className={cn(
              "flex h-6 max-w-[150px] min-w-0 items-center gap-1 rounded-md px-1.5 text-ui-10-5 transition",
              menuOpen
                ? "bg-indigo-400/15 text-indigo-100"
                : "text-muted-foreground hover:bg-white/8 hover:text-foreground",
              streaming && "opacity-50",
            )}
          >
            <span className="truncate font-mono">{active.chatModel || "选择模型"}</span>
            <ChevronDown
              className={cn(
                "size-2.5 shrink-0 opacity-60 transition",
                menuOpen && "rotate-180",
              )}
            />
          </button>
          <button
            onClick={() => active && void doRefresh(active.id)}
            disabled={refreshing || streaming}
            title="刷新模型列表"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/8 hover:text-foreground disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          </button>
          {refreshError && (
            <span className="truncate text-ui-10 text-red-400" title={refreshError}>
              刷新失败
            </span>
          )}
        </>
      ) : (
        <>
          <span className="text-ui-11 text-muted-foreground/60">未配置 API</span>
          <button
            onClick={() => useUiStore.getState().setAppView("settings")}
            className="ml-auto text-ui-11 text-indigo-300 transition hover:text-indigo-200"
          >
            去设置 →
          </button>
        </>
      )}

      {createPortal(
        menuOpen && pos && active ? (
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              zIndex: 100,
            }}
            className="glass-float overflow-y-auto rounded-xl p-1 text-popover-foreground"
          >
            {providers.map((p) => (
              <div key={p.id}>
                <div className="px-2 pb-0.5 pt-1.5 text-ui-10 font-semibold text-muted-foreground/70">
                  {p.name}
                  {!p.apiKeySet && "（未保存 Key）"}
                </div>
                {p.models && p.models.length > 0 ? (
                  p.models.map((m) => {
                    const isCurrent = p.id === active.id && p.chatModel === m;
                    return (
                      <button
                        key={m}
                        onClick={() => pick(p.id, m)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-ui-11 transition hover:bg-white/8",
                          isCurrent && "bg-indigo-400/15 text-indigo-200",
                        )}
                      >
                        <span className="truncate">{m}</span>
                        {isCurrent && <Check className="ml-auto size-3 shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-2 pb-1 text-ui-10 text-muted-foreground/60">
                    {p.apiKeySet ? "未获取模型 — 点右侧刷新" : "未配置 Key"}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null,
        document.body,
      )}
    </div>
  );
}
