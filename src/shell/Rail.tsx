import { Settings } from "lucide-react";
import { useUiStore } from "../stores/uiStore";
import { cn } from "../lib/utils";
import { NAV_ENTRIES } from "./workbench";

/**
 * 图标栏（56px）：**唯一导航入口**。
 *
 * 只放图标 + 悬停提示，宽度恒定；具体视图的辅助面板（如日历的小月历）由各自的面板承担。
 * 新增工作台/工具只改 `workbench.ts`，这里自动出现。
 */
export function Rail() {
  const appView = useUiStore((s) => s.appView);

  const btn = (active: boolean) =>
    cn(
      "relative flex size-9 items-center justify-center rounded-xl border transition",
      active
        ? "border-indigo-400/40 bg-indigo-400/15 text-indigo-200"
        : "border-transparent text-muted-foreground hover:bg-white/6 hover:text-foreground",
    );

  return (
    <aside className="glass-bar flex w-14 shrink-0 flex-col items-center gap-1 border-r py-2">
      {NAV_ENTRIES.map((n) => (
        <button
          key={n.id}
          onClick={() => useUiStore.getState().setAppView(n.id)}
          title={n.hint}
          className={btn(appView === n.id)}
        >
          <n.icon className="size-4" />
        </button>
      ))}

      <div className="my-1 h-px w-6 bg-white/10" />

      <div className="flex-1" />

      <button
        onClick={() => useUiStore.getState().setAppView("settings")}
        title="设置（LLM 供应商 / 联网搜索 / 记忆偏好）"
        className={btn(appView === "settings")}
      >
        <Settings className="size-4" />
      </button>
    </aside>
  );
}