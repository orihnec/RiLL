import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./app/App";
import { initDb } from "./kernel/db";
import { kernelMigrations } from "./kernel/migrations";
import { loadModules } from "./kernel/module";
import { modules } from "./modules";
import { commands } from "./kernel/commands";
import { useSettingsStore } from "./stores/settingsStore";
import { useCalendarStore } from "./stores/calendarStore";
import { useUiStore } from "./stores/uiStore";
import { useChatStore } from "./stores/chatStore";

/** 应用级命令（注册进内核命令注册表，Cmd+K 可见）。 */
function registerAppCommands() {
  commands.register({
    id: "app.newEvent",
    title: "新建事件",
    keywords: ["创建", "日程"],
    run: () => useUiStore.getState().openCreateDialog(),
  });
  commands.register({
    id: "app.viewWeek",
    title: "切换到周视图",
    keywords: ["周"],
    run: () => useCalendarStore.getState().setView("week"),
  });
  commands.register({
    id: "app.viewMonth",
    title: "切换到月视图",
    keywords: ["月"],
    run: () => useCalendarStore.getState().setView("month"),
  });
  commands.register({
    id: "app.goToday",
    title: "回到今天",
    keywords: ["今天"],
    run: () => useCalendarStore.getState().goToday(),
  });
  commands.register({
    id: "app.openSettings",
    title: "打开设置",
    keywords: ["设置", "api", "key"],
    run: () => useUiStore.getState().setSettingsOpen(true),
  });
  commands.register({
    id: "app.openChat",
    title: "打开 AI 助手",
    keywords: ["ai", "助手", "对话", "chat"],
    run: () => useChatStore.getState().setOpen(true),
  });
}

/** 启动：加载模块清单 → 初始化数据库（迁移）→ 加载设置 → 注册命令 → 渲染。 */
async function boot() {
  const root = document.getElementById("root")!;
  try {
    const registry = loadModules(modules);
    await initDb([...kernelMigrations, ...registry.migrations]);
    await useSettingsStore.getState().load();
    registerAppCommands();
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
