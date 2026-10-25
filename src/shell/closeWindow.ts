import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUiStore } from "../stores/uiStore";
import { getCloseBehavior, setCloseBehavior, type CloseBehavior } from "../kernel/closeBehavior";

/**
 * 关闭窗口的**唯一入口**（标题栏 ✕、Alt+F4、任何地方都走这里）。
 *
 * 规则：
 * 1. 还没选过（`ask`）→ 弹一次确认框；
 * 2. 选过 → 按记住的方式静默执行，**不再弹窗**；
 * 3. 设置 → 关闭窗口 可改（改回「每次询问」才会重新弹）。
 *
 * 另外维护一份内存副本：即使数据库写入失败，本次运行内也不会重复弹窗。
 */
let cached: CloseBehavior | null = null;

export async function rememberCloseBehavior(v: CloseBehavior): Promise<void> {
  cached = v;
  await setCloseBehavior(v).catch(() => undefined);
}

async function behavior(): Promise<CloseBehavior> {
  if (cached) return cached;
  cached = await getCloseBehavior();
  return cached;
}

export async function requestClose(): Promise<void> {
  const b = await behavior();
  if (b === "ask") {
    useUiStore.getState().setCloseDialogOpen(true);
    return;
  }
  if (b === "tray") await getCurrentWindow().hide();
  else await invoke("quit");
}
