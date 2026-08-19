import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./app/App";
import { initDb } from "./kernel/db";
import { kernelMigrations } from "./kernel/migrations";
import { loadModules } from "./kernel/module";
import { modules } from "./modules";

/** 启动：加载模块清单 → 初始化数据库（迁移）→ 渲染。 */
async function boot() {
  const root = document.getElementById("root")!;
  try {
    const registry = loadModules(modules);
    await initDb([...kernelMigrations, ...registry.migrations]);
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
