import { ACCOUNT_COLS, KEYRING_SERVICE, keyringUser } from "./consts";
import { getDb } from "../../../kernel/db";
import { presetOf } from "./types";
import { setPassword, deletePassword } from "tauri-plugin-keyring-api";
import type { AccountRow, MailAccount, NewAccountInput } from "./types";

export function toAccount(r: AccountRow): MailAccount {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    host: r.host,
    port: r.port,
    security: r.security,
    username: r.username,
    syncDays: r.sync_days,
    syncLimit: r.sync_limit,
    confirmBeforeSync: r.confirm_before_sync === 1,
    notify: r.notify !== 0,
    notifyInterval: r.notify_interval > 0 ? r.notify_interval : 15,
    watchInterval: r.watch_interval > 0 ? r.watch_interval : 20,
    enabled: r.enabled === 1,
    lastSyncAt: r.last_sync_at,
    lastError: r.last_error,
    createdAt: r.created_at,
  };
}

export async function listAccounts(): Promise<MailAccount[]> {
  const db = getDb();
  const rows = await db.select<AccountRow[]>(
    `SELECT ${ACCOUNT_COLS} FROM mail_accounts ORDER BY created_at ASC`,
  );
  return rows.map(toAccount);
}

export async function getAccount(id: string): Promise<MailAccount | null> {
  const db = getDb();
  const rows = await db.select<AccountRow[]>(
    `SELECT ${ACCOUNT_COLS} FROM mail_accounts WHERE id = $1`,
    [id],
  );
  return rows[0] ? toAccount(rows[0]) : null;
}

export async function addAccount(input: NewAccountInput): Promise<MailAccount> {
  const db = getDb();
  const preset = presetOf(input.presetId);
  const email = input.email.trim();
  if (!email) throw new Error("请填写邮箱地址");
  const password = input.password.trim();
  if (!password) throw new Error("请填写授权码");

  const existing = await db.select<{ id: string }[]>(
    "SELECT id FROM mail_accounts WHERE email = $1",
    [email],
  );
  if (existing.length > 0) throw new Error(`${email} 已经添加过了`);

  const id = crypto.randomUUID();
  const now = Date.now();
  await setPassword(KEYRING_SERVICE, keyringUser(id), password);
  try {
    await db.execute(
      `INSERT INTO mail_accounts
         (id, email, display_name, host, port, security, username, sync_days, sync_limit,
          confirm_before_sync, notify, notify_interval, watch_interval, enabled, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$12,1,$13)`,
      [
        id,
        email,
        input.displayName?.trim() || null,
        (input.host ?? preset.host).trim(),
        input.port ?? preset.port,
        input.security ?? preset.security,
        (input.username ?? email).trim(),
        input.syncDays ?? 30,
        input.syncLimit ?? 200,
        input.notify === false ? 0 : 1,
        input.notifyInterval ?? 15,
        input.watchInterval ?? 20,
        now,
      ],
    );
  } catch (e) {
    await deletePassword(KEYRING_SERVICE, keyringUser(id)).catch(() => undefined);
    throw e;
  }
  return (await getAccount(id))!;
}

export async function updateAccount(
  id: string,
  patch: Partial<
    Pick<
      MailAccount,
      "displayName" | "syncDays" | "syncLimit" | "confirmBeforeSync" | "notify" | "notifyInterval" | "watchInterval" | "enabled"
    >
  >,
  password?: string,
): Promise<void> {
  const db = getDb();
  if (password?.trim()) await setPassword(KEYRING_SERVICE, keyringUser(id), password.trim());
  if (patch.displayName !== undefined) {
    await db.execute("UPDATE mail_accounts SET display_name = $1 WHERE id = $2", [
      patch.displayName?.trim() || null,
      id,
    ]);
  }
  if (patch.syncDays !== undefined) {
    await db.execute("UPDATE mail_accounts SET sync_days = $1 WHERE id = $2", [patch.syncDays, id]);
  }
  if (patch.syncLimit !== undefined) {
    await db.execute("UPDATE mail_accounts SET sync_limit = $1 WHERE id = $2", [patch.syncLimit, id]);
  }
  if (patch.confirmBeforeSync !== undefined) {
    await db.execute("UPDATE mail_accounts SET confirm_before_sync = $1 WHERE id = $2", [
      patch.confirmBeforeSync ? 1 : 0,
      id,
    ]);
  }
  if (patch.notify !== undefined) {
    await db.execute("UPDATE mail_accounts SET notify = $1 WHERE id = $2", [patch.notify ? 1 : 0, id]);
  }
  if (patch.notifyInterval !== undefined) {
    await db.execute("UPDATE mail_accounts SET notify_interval = $1 WHERE id = $2", [
      Math.max(1, Math.round(patch.notifyInterval)),
      id,
    ]);
  }
  if (patch.watchInterval !== undefined) {
    await db.execute("UPDATE mail_accounts SET watch_interval = $1 WHERE id = $2", [
      Math.max(5, Math.round(patch.watchInterval)),
      id,
    ]);
  }
  if (patch.enabled !== undefined) {
    await db.execute("UPDATE mail_accounts SET enabled = $1 WHERE id = $2", [patch.enabled ? 1 : 0, id]);
  }
}

export async function deleteAccount(id: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM mail_messages WHERE account_id = $1", [id]);
  await db.execute("DELETE FROM mail_folders WHERE account_id = $1", [id]);
  await db.execute("DELETE FROM mail_accounts WHERE id = $1", [id]);
  await deletePassword(KEYRING_SERVICE, keyringUser(id)).catch(() => undefined);
}

export async function setAccountSyncResult(id: string, error: string | null): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE mail_accounts SET last_sync_at = $1, last_error = $2 WHERE id = $3", [
    Date.now(),
    error,
    id,
  ]);
}
