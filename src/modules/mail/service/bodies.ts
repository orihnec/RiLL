import { fetchBody, rustConfigOf } from "./remote";
import { getDb } from "../../../kernel/db";
import { getFolder } from "./folders";
import { MESSAGE_COLS } from "./consts";
import { saveMessageBody } from "./messages";
import type { MessageRow } from "./types";

export async function prefetchBodies(
  accountId: string,
  folderId: string,
  limit = 8,
): Promise<number> {
  const db = getDb();
  const rows = await db.select<MessageRow[]>(
    `SELECT ${MESSAGE_COLS} FROM mail_messages
     WHERE folder_id = $1 AND body_fetched_at IS NULL
     ORDER BY date DESC LIMIT ${Math.min(Math.max(limit, 1), 30)}`,
    [folderId],
  );
  if (rows.length === 0) return 0;
  const folder = await getFolder(folderId);
  if (!folder) return 0;
  const cfg = await rustConfigOf(accountId);
  let done = 0;
  for (const r of rows) {
    try {
      const body = await fetchBody(cfg, folder.raw, r.uid);
      await saveMessageBody(r.id, body);
      done += 1;
    } catch (e) {
      console.warn("[mail] 预取正文失败，稍后再试", r.uid, e);
      break;
    }
  }
  return done;
}

export async function countMissingBodies(folderId: string): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM mail_messages WHERE folder_id = $1 AND body_fetched_at IS NULL",
    [folderId],
  );
  return rows[0]?.n ?? 0;
}

export function looksLikeMojibake(text: string | null | undefined): boolean {
  if (!text) return false;
  let replacement = 0;
  let exotic = 0;
  let cjk = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 0xfffd) replacement += 1;
    else if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) cjk += 1;
    else if (
      (c >= 0x250 && c <= 0x2ff) ||
      (c >= 0x400 && c <= 0x4ff) ||
      (c >= 0x530 && c <= 0x58f)
    )
      exotic += 1;
  }
  return replacement > 0 || (exotic > 0 && cjk === 0);
}

export async function countBadBodies(folderId: string): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ body_text: string | null; subject: string | null }[]>(
    `SELECT body_text, subject FROM mail_messages
     WHERE folder_id = $1 AND body_fetched_at IS NOT NULL`,
    [folderId],
  );
  return rows.filter((r) => looksLikeMojibake(r.body_text) || looksLikeMojibake(r.subject)).length;
}

export async function repairBodies(
  accountId: string,
  folderId: string,
  limit = 10,
): Promise<number> {
  const db = getDb();
  const candidates = await db.select<MessageRow[]>(
    `SELECT ${MESSAGE_COLS} FROM mail_messages
     WHERE folder_id = $1 AND body_fetched_at IS NOT NULL
     ORDER BY date DESC`,
    [folderId],
  );
  const bad = candidates.filter(
    (r) => looksLikeMojibake(r.body_text) || looksLikeMojibake(r.subject),
  );
  if (bad.length === 0) return 0;
  const folder = await getFolder(folderId);
  if (!folder) return 0;
  const cfg = await rustConfigOf(accountId);
  let fixed = 0;
  for (const r of bad.slice(0, Math.max(1, Math.min(limit, 50)))) {
    try {
      const body = await fetchBody(cfg, folder.raw, r.uid);
      await saveMessageBody(r.id, body);
      fixed += 1;
    } catch (e) {
      console.warn("[mail] 修复乱码正文失败，稍后再试", r.uid, e);
      break;
    }
  }
  return fixed;
}
