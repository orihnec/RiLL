import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./shell/App";
import { initDb } from "./kernel/db";
import { kernelMigrations } from "./kernel/migrations";
import { loadModules } from "./kernel/module";
import { modules } from "./modules";
import { registerAppCommands } from "./shell/commands";
import { useSettingsStore } from "./stores/settingsStore";
import { useCategoryStore } from "./stores/categoryStore";
import { useJobStatusStore } from "./modules/jobs/statusStore";
import { useThemeStore, watchThemeChanges } from "./stores/themeStore";
import { useChatStore } from "./stores/chatStore";
import { useKbStore } from "./stores/kbStore";
import { backfillDeadlineIso } from "./modules/scout/service";
import { archiveStalePreferences, runReflection, countUnreflectedAgentEdits } from "./kernel/agent/memory";
import { startReminderService, ensureNotificationPermission } from "./kernel/reminder";
import { startMailNotifyService } from "./modules/mail/notify";
import { OverviewPanel } from "./shell/OverviewPanel";

/** 启动自迭代链路：90 天归档 + via_agent diff ≥ 20 自动反思（静默，失败不影响启动）。 */
async function runMemoryMaintenance() {
  try {
    await archiveStalePreferences();
    const n = await countUnreflectedAgentEdits();
    if (n >= 20) {
      const r = await runReflection();
      console.log(`[memory] auto reflection: ${r.created} created`, r.error ?? "");
    }
  } catch (e) {
    console.warn("[memory] maintenance failed", e);
  }
}

/**
 * 是否运行在 Tauri webview 里。
 *
 * 直接用浏览器打开 vite（`npm run dev`）或静态服务 dist 时，`window.__TAURI_INTERNALS__`
 * 不存在 → 任何 `invoke(...)` 都会抛 `TypeError: Cannot read properties of undefined (reading 'invoke')`。
 * 这里先拦一道，给一句能照做的提示，而不是让人对着崩栈猜。
 */
const IN_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** 浏览器里打开时的说明页（纯静态，不碰任何 Tauri API）。 */
function NonTauriNotice() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", lineHeight: 1.7, color: "#e5e7eb" }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>RiliAgent 是 Tauri 桌面应用</h2>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#9ca3af" }}>
        当前页面运行在普通浏览器里，没有 Tauri IPC（<code>window.__TAURI_INTERNALS__</code>），
        所以数据库 / 文件 / 通知等能力都不可用。
      </p>
      <p style={{ margin: "0 0 6px", fontSize: 13 }}>请用桌面壳启动：</p>
      <pre style={{ margin: "0 0 12px", padding: "10px 12px", background: "#111827", borderRadius: 8, fontSize: 12 }}>
        npm run tauri dev
      </pre>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
        只调界面样式时，也请从这个窗口打开 DevTools —— 直接开 http://localhost:5173 会得到这个提示。
      </p>
    </div>
  );
}

/** 启动：加载模块清单 → 初始化数据库（迁移）→ 加载设置 → 注册命令 → 渲染。 */
async function boot() {
  const root = document.getElementById("root")!;

  // 非 Tauri 环境：不进入业务流程，直接说清原因
  if (!IN_TAURI) {
    ReactDOM.createRoot(root).render(<NonTauriNotice />);
    return;
  }

  try {
    const registry = loadModules(modules);
    await initDb([...kernelMigrations, ...registry.migrations]);
    await useSettingsStore.getState().load();
    await useCategoryStore.getState().load();
    await useJobStatusStore.getState().load();
    // 主题：读库并应用（主窗口与悬浮窗都要应用，避免两窗口配色不一致）
    await watchThemeChanges();
    await useThemeStore.getState().load();
    registerAppCommands();
    void useChatStore.getState().init();
    void useKbStore.getState().load();
    void runMemoryMaintenance();
    // 日程提醒：应用运行即生效（含托盘常驻）；通知权限静默请求
    startReminderService();
    void ensureNotificationPermission();
    // 新邮件提醒：每分钟 tick，到点才增量同步收件箱；有新邮件才发通知
    startMailNotifyService();
    // 悬浮窗模式（view=overview）：只渲染今日日程面板（轻量）
    const isOverview = new URLSearchParams(window.location.search).get("view") === "overview";
    if (isOverview) {
      // 透明窗口：清掉主窗口的深色底板与环境光渐变，让圆角面板透出桌面
      document.body.classList.add("is-overview");
      ReactDOM.createRoot(root).render(
        <React.StrictMode>
          <OverviewPanel />
        </React.StrictMode>,
      );
      return;
    }
    // 校招信息库：老库补齐截止日期归一化列（一次性；跑完就是空查询，失败不阻塞启动）
    void backfillDeadlineIso()
      .then((n) => {
        if (n > 0) console.info(`[scout] deadline_iso 回填 ${n} 条`);
      })
      .catch((e) => console.warn("[scout] deadline_iso 回填失败", e));
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (err) {
    console.error("[boot] failed", err);
    ReactDOM.createRoot(root).render(
      <pre
        style={{
          margin: 24,
          padding: 16,
          color: "#f87171",
          fontFamily: "monospace",
          fontSize: 12,
          whiteSpace: "pre-wrap",
        }}
      >
        {String(err)}
      </pre>,
    );
  }
}

void boot();
