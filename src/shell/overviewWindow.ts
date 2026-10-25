import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/** 今日日程悬浮窗开关（overview 窗口由 Rust 侧预创建，这里只显示/隐藏）。 */
export async function toggleOverviewWindow(): Promise<void> {
  const ov = await WebviewWindow.getByLabel("overview");
  if (!ov) return;
  if (await ov.isVisible()) {
    await ov.hide();
  } else {
    await ov.show();
    await ov.setFocus();
  }
}
