import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useUiStore } from "../../stores/uiStore";
import { useCalendarStore } from "../../stores/calendarStore";

/**
 * 全局快捷键 + 原生命令栏事件。
 *
 * Ctrl/Cmd+K 命令栏（Rust 全局快捷键与 keydown 双触发 → 350ms 去重）、
 * Ctrl+N 新建、Ctrl+1/2 周月、Ctrl+T 今天、Ctrl+, 设置。
 */
export function useAppShortcuts(): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let lastToggle = 0;

    const togglePalette = () => {
      const now = Date.now();
      if (now - lastToggle < 350) return; // 全局快捷键与 keydown 双触发去重
      lastToggle = now;
      const ui = useUiStore.getState();
      ui.setPaletteOpen(!ui.paletteOpen);
    };

    const onKey = (e: KeyboardEvent) => {
      const mod = navigator.userAgent.includes("Mac") ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const ui = useUiStore.getState();
      switch (e.key.toLowerCase()) {
        case "k":
          e.preventDefault();
          togglePalette();
          break;
        case "n":
          e.preventDefault();
          ui.openCreateDialog();
          break;
        case "1":
          e.preventDefault();
          ui.setAppView("calendar");
          useCalendarStore.getState().setView("week");
          break;
        case "2":
          e.preventDefault();
          ui.setAppView("calendar");
          useCalendarStore.getState().setView("month");
          break;
        case "t":
          e.preventDefault();
          useCalendarStore.getState().goToday();
          break;
        case ",":
          e.preventDefault();
          ui.setAppView("settings");
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    void listen("riliagent:cmd-k", togglePalette).then((u) => {
      unlisten = u;
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      unlisten?.();
    };
  }, []);
}
