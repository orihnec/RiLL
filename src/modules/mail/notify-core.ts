import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useMailStore } from "../../stores/mailStore";
import { totalUnread } from "./service";

/**
 * 通知与未读角标的公共底座。
 * 单独拆一个文件是为了避免 notify.ts ⇄ watch.ts 循环依赖（两边都要发通知/刷角标）。
 */

let permission: boolean | null = null;

async function ensurePermission(): Promise<boolean> {
  if (permission !== null) return permission;
  try {
    permission = (await isPermissionGranted()) || (await requestPermission()) === "granted";
  } catch {
    permission = false;
  }
  return permission;
}

/** 新邮件通知（实时监听线程与兜底轮询共用）。 */
export async function notifyNewMail(title: string, body: string): Promise<void> {
  if (!(await ensurePermission())) return;
  try {
    sendNotification({ title, body });
  } catch (e) {
    console.warn("[mail] 通知发送失败", e);
  }
}

/** 刷新侧边栏未读角标。 */
export async function refreshUnreadBadge(): Promise<number> {
  try {
    const n = await totalUnread();
    useMailStore.getState().setUnreadTotal(n);
    return n;
  } catch {
    return 0;
  }
}
