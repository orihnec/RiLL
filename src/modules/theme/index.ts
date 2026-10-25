import type { Module } from "../../kernel/module";
import { themeTools } from "./tools";

/**
 * theme 模块：主题与风格（外观设置）。
 * 无迁移、无面板——主题本身由 lib/themes.ts + stores/themeStore.ts 驱动 UI，
 * 这里只把「查看/修改主题」暴露成 Agent 工具，让 AI 能直接帮用户调配色。
 */
export const themeModule: Module = {
  id: "theme",
  name: "主题与风格",
  tools: themeTools,
  panels: [],
};
