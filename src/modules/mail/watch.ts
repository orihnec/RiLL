import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useMailStore } from "../../stores/mailStore";
import { rustConfigOf, listAccounts, listFolders, listMessages, type MailAccount } from "./service";
import { syncFolder } from "./sync";
import { notifyNewMail, refreshUnreadBadge } from "./notify-core";

/**
 * **实时接收**：邮件到达的"监听"放在 Rust 侧的常驻线程里，不放 JS。
 *
 * 为什么：WebView2 会把窗口隐藏时的 JS 定时器节流到 1 分钟粒度，靠 `setInterval` 做不到准实时；
 * Rust 线程的真 sleep 不受影响，而且能维持**长连接**（不用每次重连 TLS+登录）。
 *
 * 两种模式（Rust 侧按 CAPABILITY 自动选）：
 * - 服务器支持 `IDLE`（QQ / Gmail 等）→ 真推送，服务器有新邮件立刻通知；
 * - 不支持（**163/Coremail 实测不支持**）→ 每 N 秒一次 `STATUS INBOX (MESSAGES UNSEEN)`，
 *   实测只要 ~21ms，不 SELECT、不拉邮件头，20 秒一次就非常接近实时。
 */

interface WatchSpec {
  accountId: string;
  host: string;
  port: number;
  security: string;
  username: string;
  password: string;
  folder: string;
  intervalSec: number;
}

export interface WatchEventPayload {
  accountId: string;
  kind: "ready" | "changed" | "error" | "stopped";
  messages: number;
  unseen: number;
  previous: number;
  mode: "idle" | "poll" | "";
  message: string;
}

let unlisten: UnlistenFn | null = null;
let applying = false;

/** 防止同一账号并发同步（一次新邮件事件可能连着来好几个） */
const syncing = new Map<string, Promise<number>>();
/** 事件去抖：同账号 2 秒内只处理一次 */
const lastEventAt = new Map<string, number>();

function setWatchInfo(accountId: string, info: { mode: string; status: string; message: string; unseen: number }) {
  useMailStore.getState().setWatch(accountId, info);
}

/** 组装监听规格：只监听"启用 + 开了实时接收"的账号的收件箱。 */
async function buildSpecs(): Promise<WatchSpec[]> {
  const accounts = (await listAccounts()).filter((a: MailAccount) => a.enabled && a.notify);
  const specs: WatchSpec[] = [];
  for (const a of accounts) {
    const folders = await listFolders(a.id);
    const inbox = folders.find((f) => f.special === "inbox" && f.selectable) ?? folders.find((f) => f.selectable);
    if (!inbox) continue;
    const cfg = await rustConfigOf(a.id); // 里面带授权码（从钥匙串取）
    specs.push({
      accountId: a.id,
      host: cfg.host,
      port: cfg.port,
      security: cfg.security,
      username: cfg.username,
      password: cfg.password,
      folder: inbox.raw,
      intervalSec: a.watchInterval > 0 ? a.watchInterval : 20,
    });
  }
  return specs;
}

/** 有新邮件：增量同步收件箱 + 发通知 + 刷新角标 */
async function handleNewMail(ev: WatchEventPayload): Promise<void> {
  const now = Date.now();
  const last = lastEventAt.get(ev.accountId) ?? 0;
  if (now - last < 2000) return;
  lastEventAt.set(ev.accountId, now);

  const account = (await listAccounts()).find((a) => a.id === ev.accountId);
  if (!account) return;
  const folders = await listFolders(account.id);
  const inbox = folders.find((f) => f.special === "inbox");
  if (!inbox) return;

  const name = account.displayName ?? account.email;
  const existing = syncing.get(ev.accountId);
  if (existing) {
    await existing.catch(() => undefined);
    return;
  }
  const task = (async () => {
    const res = await syncFolder(account.id, inbox.id);
    await refreshUnreadBadge();
    useMailStore.getState().bump();
    if (res.added > 0) {
      const { rows } = await listMessages({ folderId: inbox.id, limit: 5 });
      const lines = rows
        .filter((m) => !m.seen)
        .slice(0, 3)
        .map((m) => `· ${(m.subject ?? "(无主题)").slice(0, 40)}`);
      await notifyNewMail(`${name}：${res.added} 封新邮件`, lines.join("\n") || `收件箱新增 ${res.added} 封`);
    }
    return res.added;
  })();
  syncing.set(ev.accountId, task);
  try {
    await task;
  } finally {
    syncing.delete(ev.accountId);
  }
}

async function onEvent(ev: WatchEventPayload): Promise<void> {
  const status = ev.kind === "error" || ev.kind === "stopped" ? ev.kind : "ok";
  setWatchInfo(ev.accountId, {
    mode: ev.mode,
    status,
    message: ev.message,
    unseen: ev.unseen,
  });
  if (ev.kind === "error" || ev.kind === "stopped") {
    console.warn("[mail] 实时接收：", ev.message);
    return;
  }
  if (ev.kind === "changed") {
    try {
      await handleNewMail(ev);
    } catch (e) {
      console.warn("[mail] 新邮件处理失败", e);
    }
  }
}

/**
 * 让 Rust 侧的监听线程与当前账号配置对齐（幂等：配置没变不会重连）。
 * 账号增删改、开关实时接收、启动时都调用它。
 */
export async function applyMailWatch(): Promise<string[]> {
  if (applying) return [];
  applying = true;
  try {
    if (!unlisten) {
      unlisten = await listen<WatchEventPayload>("mail://watch", (e) => void onEvent(e.payload));
    }
    const specs = await buildSpecs();
    const started = await invoke<string[]>("mail_watch_apply", { specs });
    // 不再被监听的账号清掉界面状态
    const ids = new Set(specs.map((s) => s.accountId));
    const store = useMailStore.getState();
    for (const id of Object.keys(store.watch)) {
      if (!ids.has(id)) store.clearWatch(id);
    }
    return started;
  } catch (e) {
    console.warn("[mail] 启动实时接收失败", e);
    return [];
  } finally {
    applying = false;
  }
}

/** 停止全部监听（关闭实时接收/退出时）。 */
export async function stopMailWatch(): Promise<void> {
  try {
    await invoke("mail_watch_stop");
  } catch (e) {
    console.warn("[mail] 停止实时接收失败", e);
  }
}
