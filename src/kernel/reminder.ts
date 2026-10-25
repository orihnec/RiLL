import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getDb } from "./db";
import { listOccurrences } from "../modules/calendar/service";

/**
 * 日程提醒服务：应用运行期间（含托盘常驻）每 30s 检查未来日程，
 * 到达"开始前 N 分钟"窗口时发 Windows 通知。已提醒键持久化去重。
 * 未来升级桌面宠物：只需替换 notify() 的展示端，检查逻辑不变。
 */

const CHECK_MS = 30_000;
const REMINDED_KEY = "rili:reminded";

const DEFAULT_LEAD_MINUTES = 10;

export async function reminderLeadMinutes(): Promise<number> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = 'reminder_lead_minutes'",
    );
    const n = Number(rows[0]?.value);
    return Number.isFinite(n) && n >= 0 && n <= 120 ? n : DEFAULT_LEAD_MINUTES;
  } catch {
    return DEFAULT_LEAD_MINUTES;
  }
}

export async function setReminderLeadMinutes(minutes: number): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    ["reminder_lead_minutes", String(Math.round(minutes))],
  );
}

/** 已提醒键（eventId|occurrenceStart），localStorage 持久化，重启不重复提醒。 */
function loadReminded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(REMINDED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function persistReminded(keys: Set<string>): void {
  try {
    localStorage.setItem(REMINDED_KEY, JSON.stringify([...keys].slice(-500)));
  } catch {
    // 存储不可用时仅内存去重
  }
}

const reminded = loadReminded();

/** 通知展示端（未来桌面宠物替换点）。 */
async function notify(title: string, body: string): Promise<void> {
  try {
    sendNotification({ title, body });
  } catch (e) {
    console.warn("[reminder] notify failed", e);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

async function checkOnce(): Promise<void> {
  try {
    const leadMs = (await reminderLeadMinutes()) * 60_000;
    const now = Date.now();
    // 未来 24h 内的日程（含重复事件 rrule 展开）
    const occs = await listOccurrences(now, now + 24 * 3_600_000);
    const changed: string[] = [];
    for (const o of occs) {
      const start = o.startAt;
      // 提醒窗口：[开始前 lead 分钟, 开始时刻)
      if (now < start - leadMs || now >= start) continue;
      // 同一事件的不同实例（originalStart 定位）各自提醒一次
      const key = `${o.id}|${o.originalStart ?? o.startAt}`;
      if (reminded.has(key)) continue;
      reminded.add(key);
      changed.push(key);
      const time = new Date(start).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      await notify(
        "日程提醒",
        `${o.title} 将于 ${time} 开始${o.notes ? `（${o.notes.slice(0, 60)}）` : ""}`,
      );
    }
    if (changed.length > 0) persistReminded(reminded);
  } catch (e) {
    console.warn("[reminder] check failed", e);
  }
}

/** 启动提醒服务（应用启动时调用；托盘常驻时持续生效）。 */
export function startReminderService(): void {
  if (timer) return;
  void checkOnce();
  timer = setInterval(() => void checkOnce(), CHECK_MS);
}

/** 请求通知权限（首次启动静默尝试，拒绝不影响其他功能）。 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === "granted";
  } catch (e) {
    console.warn("[reminder] permission request failed", e);
    return false;
  }
}
