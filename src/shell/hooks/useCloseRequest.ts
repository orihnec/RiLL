import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { requestClose } from "../closeWindow";

/**
 * 关闭请求（Alt+F4 / 系统关闭按钮）：Rust 拦下后发事件，交给统一入口处理。
 * 具体策略见 `shell/closeWindow.ts`（只问一次，之后静默执行）。
 */
export function useCloseRequestListener(): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("riliagent:close-requested", () => void requestClose()).then((u) => {
      unlisten = u;
    });
    return () => {
      unlisten?.();
    };
  }, []);
}
