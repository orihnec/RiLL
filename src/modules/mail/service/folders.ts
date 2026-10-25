import { FOLDER_COLS } from "./consts";
import { getDb } from "../../../kernel/db";
import type { FolderRow, MailFolder, RustFolder } from "./types";

export function toFolder(r: FolderRow): MailFolder {
  return {
    id: r.id,
    accountId: r.account_id,
    raw: r.raw,
    name: r.name,
    delimiter: r.delimiter,
    special: r.special,
    selectable: r.selectable === 1,
    uidValidity: r.uid_validity,
    lastUid: r.last_uid,
    total: r.total,
    unread: r.unread,
    updatedAt: r.updated_at,
  };
}

export async function listFolders(accountId: string): Promise<MailFolder[]> {
  const db = getDb();
  const rows = await db.select<FolderRow[]>(
    `SELECT ${FOLDER_COLS} FROM mail_folders WHERE account_id = $1
     ORDER BY CASE special WHEN 'inbox' THEN 0 WHEN 'sent' THEN 1 WHEN 'drafts' THEN 2
              WHEN 'junk' THEN 3 WHEN 'trash' THEN 4 ELSE 5 END, name`,
    [accountId],
  );
  return rows.map(toFolder);
}

export async function getFolder(id: string): Promise<MailFolder | null> {
  const db = getDb();
  const rows = await db.select<FolderRow[]>(`SELECT ${FOLDER_COLS} FROM mail_folders WHERE id = $1`, [id]);
  return rows[0] ? toFolder(rows[0]) : null;
}

export async function upsertFolders(
  accountId: string,
  folders: RustFolder[],
): Promise<MailFolder[]> {
  const db = getDb();
  const now = Date.now();
  for (const f of folders) {
    await db.execute(
      `INSERT INTO mail_folders (id, account_id, raw, name, delimiter, special, selectable, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(account_id, raw) DO UPDATE SET
         name = excluded.name, delimiter = excluded.delimiter,
         special = excluded.special, selectable = excluded.selectable, updated_at = excluded.updated_at`,
      [
        crypto.randomUUID(),
        accountId,
        f.raw,
        f.name,
        f.delimiter,
        f.special,
        f.selectable ? 1 : 0,
        now,
      ],
    );
  }
  return listFolders(accountId);
}

export async function recomputeFolderStats(accountId: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE mail_folders SET
       total = (SELECT COUNT(*) FROM mail_messages m WHERE m.folder_id = mail_folders.id),
       unread = (SELECT COUNT(*) FROM mail_messages m WHERE m.folder_id = mail_folders.id AND m.seen = 0)
     WHERE account_id = $1`,
    [accountId],
  );
}

export async function updateFolderStats(  folderId: string,
  patch: { uidValidity?: number; lastUid?: number; total?: number; unread?: number },
): Promise<void> {
  const db = getDb();
  const sets: string[] = ["updated_at = $1"];
  const params: (string | number)[] = [Date.now()];
  const add = (col: string, v: number) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.uidValidity !== undefined) add("uid_validity", patch.uidValidity);
  if (patch.lastUid !== undefined) add("last_uid", patch.lastUid);
  if (patch.total !== undefined) add("total", patch.total);
  if (patch.unread !== undefined) add("unread", patch.unread);
  params.push(folderId);
  await db.execute(`UPDATE mail_folders SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
}

export async function resetFolderMessages(folderId: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM mail_messages WHERE folder_id = $1", [folderId]);
  await db.execute("UPDATE mail_folders SET last_uid = 0 WHERE id = $1", [folderId]);
}

export async function countAccountMessages(accountId: string): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM mail_messages WHERE account_id = $1",
    [accountId],
  );
  return rows[0]?.n ?? 0;
}
