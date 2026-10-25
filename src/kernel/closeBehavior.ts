import { getDb } from "./db";

/** 关闭窗口（✕ / Alt+F4）时的行为。 */
export type CloseBehavior = "ask" | "tray" | "quit";

const KEY = "close_behavior";
const DEFAULT: CloseBehavior = "ask";

function isBehavior(v: unknown): v is CloseBehavior {
  return v === "ask" || v === "tray" || v === "quit";
}

/**
 * 读取关闭策略。
 *
 * 默认 `ask`（每次都问）—— 不默认静默最小化，否则用户找不到"怎么真正退出"；
 * 想省事就在对话框里勾「记住我的选择」，之后可在 设置 → 关闭窗口 改回来。
 */
export async function getCloseBehavior(): Promise<CloseBehavior> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [KEY],
    );
    const v = rows[0]?.value;
    return isBehavior(v) ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export async function setCloseBehavior(v: CloseBehavior): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [KEY, v],
  );
}
