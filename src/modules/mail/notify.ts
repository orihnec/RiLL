import { onAction } from "@tauri-apps/plugin-notification";
import { useMailStore } from "../../stores/mailStore";
import { useUiStore } from "../../stores/uiStore";
import { listAccounts, listFolders, listMessages, type MailAccount } from "./service";
import { syncFolder } from "./sync";
import { applyMailWatch } from "./watch";
import { notifyNewMail, refreshUnreadBadge } from "./notify-core";

/**
 * 新邮件提醒服务：应用运行期间（含托盘常驻）每分钟 tick 一次，
 * 到账号设定的间隔就**增量同步收件箱**；真有新邮件才发 Windows 通知。
 *
 * 复用日程提醒同一条通知通道（tauri-plugin-notification）。
 * 注意：WebView2 后台会节流定时器（最小 1 分钟粒度），所以间隔按分钟计即可。
 */

const TICK_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let actionBound = false;

/** 该账号是否到了检查时间（手动同步过也算一次检查）。导出供无头测试。 */
export function isDue(a: MailAccount, now: number): boolean {
  const interval = Math.max(1, a.notifyInterval) * 60_000;
  return a.lastSyncAt === null || now - a.lastSyncAt >= interval;
}

/**
 * 检查一个账号的收件箱；返回新增邮件数。
 * `force=false` 时只在到点时同步（供后台 tick 用）。
 */
export async function checkAccount(account: MailAccount, force = false): Promise<number> {
  if (!account.enabled) return 0;
  if (!force && !isDue(account, Date.now())) return 0;

  const folders = await listFolders(account.id);
  const inbox = folders.find((f) => f.special === "inbox");
  if (!inbox) return 0; // 还没同步过文件夹（用户从未打开过），交给手动同步

  // 首次同步（还没有 lastSyncAt）不提醒：那是把历史邮件一次性拉下来
  const firstSync = account.lastSyncAt === null;
  const synced = await syncFolder(account.id, inbox.id);
  await refreshUnreadBadge();
  if (synced.added === 0 || firstSync || !account.notify) return synced.added;

  const name = account.displayName ?? account.email;
  const { rows } = await listMessages({ folderId: inbox.id, limit: 5 });
  const lines = rows
    .filter((m) => !m.seen)
    .slice(0, 3)
    .map((m) => `· ${(m.subject ?? "(无主题)").slice(0, 40)}`);
  await notifyNewMail(
    `${name}：${synced.added} 封新邮件`,
    lines.join("\n") || `收件箱新增 ${synced.added} 封`,
  );
  useMailStore.getState().bump();
  return synced.added;
}

/** 一次后台检查：遍历启用提醒的账号（逐个来，避免同时开一堆连接）。 */
async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const accounts = (await listAccounts()).filter((a) => a.enabled && a.notify);
    for (const a of accounts) {
      try {
        await checkAccount(a, false);
      } catch (e) {
        // 单个账号失败（断网/授权码失效）不影响其它账号；错误已写进 last_error
        console.warn("[mail] 自动检查失败", a.email, e);
      }
    }
    await refreshUnreadBadge();
  } finally {
    running = false;
  }
}

/** 启动提醒服务（应用启动时调用；托盘常驻期间持续生效）。 */
export function startMailNotifyService(): void {
  if (timer) return;
  if (!actionBound) {
    actionBound = true;
    // 点通知 → 直接切到邮箱页（邮箱现在是一级页面，不再是浮层）
    void onAction(() => useUiStore.getState().setAppView("mail")).catch(() => undefined);
  }
  void refreshUnreadBadge();
  // 实时接收：Rust 侧常驻线程（IDLE 推送 / 20 秒 STATUS 轮询），不受 WebView2 定时器节流影响
  void applyMailWatch();
  // 兜底：每分钟 tick 一次，按账号设定的"分钟级"间隔做完整同步
  // （实时监听断掉、或服务器限制连接时，仍然有基本的收信保障）
  setTimeout(() => void tick(), 30_000);
  timer = setInterval(() => void tick(), TICK_MS);
}

export function stopMailNotifyService(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** 设置页/面板手动触发一次全部检查（等同「全部同步」但不发通知去重外的额外逻辑）。 */
export async function checkAllNow(): Promise<number> {
  const accounts = (await listAccounts()).filter((a) => a.enabled);
  let total = 0;
  for (const a of accounts) {
    try {
      total += await checkAccount(a, true);
    } catch (e) {
      console.warn("[mail] 手动检查失败", a.email, e);
    }
  }
  await refreshUnreadBadge();
  return total;
}
