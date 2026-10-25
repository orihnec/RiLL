import { getDb } from "../../../kernel/db";
import { MESSAGE_COLS } from "./consts";
import type { MailAttachment, MailMessage, MessageRow, RustBody, RustHeader } from "./types";

export function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function toMessage(r: MessageRow): MailMessage {
  let attachments: MailAttachment[] = [];
  if (r.attachments_json) {
    try {
      const parsed = JSON.parse(r.attachments_json) as MailAttachment[];
      if (Array.isArray(parsed)) attachments = parsed;
    } catch {
      attachments = [];
    }
  }
  return {
    id: r.id,
    accountId: r.account_id,
    folderId: r.folder_id,
    uid: r.uid,
    messageId: r.message_id,
    threadId: r.thread_id,
    references: parseJsonArray(r.references_json),
    inReplyTo: r.in_reply_to,
    subject: r.subject,
    fromName: r.from_name,
    fromAddress: r.from_address,
    toAddress: r.to_address,
    date: r.date,
    size: r.size,
    seen: r.seen === 1,
    flagged: r.flagged === 1,
    preview: r.preview,
    bodyText: r.body_text,
    bodyHtml: r.body_html,
    bodyFetchedAt: r.body_fetched_at,
    attachments,
    createdAt: r.created_at,
  };
}

export async function upsertHeaders(
  accountId: string,
  folderId: string,
  headers: RustHeader[],
): Promise<{ added: number; updated: number }> {
  if (headers.length === 0) return { added: 0, updated: 0 };
  const db = getDb();
  const now = Date.now();

  // 1) 先查已存在的 UID（分块 IN），算出真正的新增数
  const uids = headers.map((h) => h.uid);
  const existing = new Set<number>();
  for (let i = 0; i < uids.length; i += 200) {
    const chunk = uids.slice(i, i + 200);
    const holders = chunk.map((_, j) => `$${j + 2}`).join(",");
    const rows = await db.select<{ uid: number }[]>(
      `SELECT uid FROM mail_messages WHERE folder_id = $1 AND uid IN (${holders})`,
      [folderId, ...chunk],
    );
    for (const r of rows) existing.add(r.uid);
  }
  const added = headers.filter((h) => !existing.has(h.uid)).length;

  // 2) 分批 upsert（30 行 × 15 列 = 450 个参数，稳在 SQLite 上限内）
  const BATCH = 30;
  for (let i = 0; i < headers.length; i += BATCH) {
    const chunk = headers.slice(i, i + BATCH);
    const values: string[] = [];
    const params: (string | number | null)[] = [];
    for (const h of chunk) {
      const row = [
        crypto.randomUUID(),
        accountId,
        folderId,
        h.uid,
        h.messageId || null,
        JSON.stringify(h.references ?? []),
        h.inReplyTo || null,
        h.subject || "(无主题)",
        h.fromName || null,
        h.fromAddress || null,
        h.toAddress || null,
        h.date || 0,
        h.size || 0,
        h.seen ? 1 : 0,
        h.flagged ? 1 : 0,
        h.preview || null,
        now,
      ];
      values.push(`(${row.map((_, j) => `$${params.length + j + 1}`).join(",")})`);
      params.push(...row);
    }
    await db.execute(
      `INSERT INTO mail_messages
         (id, account_id, folder_id, uid, message_id, references_json, in_reply_to, subject,
          from_name, from_address, to_address, date, size, seen, flagged, preview, created_at)
       VALUES ${values.join(",")}
       ON CONFLICT(account_id, folder_id, uid) DO UPDATE SET
         message_id = COALESCE(excluded.message_id, message_id),
         references_json = excluded.references_json, in_reply_to = excluded.in_reply_to,
         subject = excluded.subject, from_name = excluded.from_name,
         from_address = excluded.from_address, to_address = excluded.to_address,
         date = excluded.date, size = excluded.size, seen = excluded.seen,
         flagged = excluded.flagged, preview = excluded.preview`,
      params,
    );
  }
  return { added, updated: headers.length - added };
}

export async function totalUnread(): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COALESCE(SUM(f.unread), 0) AS n FROM mail_folders f
     JOIN mail_accounts a ON a.id = f.account_id
     WHERE f.special = 'inbox' AND a.enabled = 1`,
  );
  return rows[0]?.n ?? 0;
}

export async function listMessages(opts: {
  folderId: string;
  keyword?: string;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ rows: MailMessage[]; total: number }> {
  const db = getDb();
  const where = ["folder_id = $1"];
  const params: (string | number)[] = [opts.folderId];
  const kw = opts.keyword?.trim();
  if (kw) {
    params.push(`%${kw.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    const p = `$${params.length}`;
    where.push(
      `(subject LIKE ${p} ESCAPE '\\' OR from_name LIKE ${p} ESCAPE '\\'` +
        ` OR from_address LIKE ${p} ESCAPE '\\' OR preview LIKE ${p} ESCAPE '\\')`,
    );
  }
  if (opts.unreadOnly) where.push("seen = 0");
  const clause = `WHERE ${where.join(" AND ")}`;
  const counted = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM mail_messages ${clause}`,
    params,
  );
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const rows = await db.select<MessageRow[]>(
    `SELECT ${MESSAGE_COLS} FROM mail_messages ${clause}
     ORDER BY date DESC, uid DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  return { rows: rows.map(toMessage), total: counted[0]?.n ?? 0 };
}

export async function getMessage(id: string): Promise<MailMessage | null> {
  const db = getDb();
  const rows = await db.select<MessageRow[]>(
    `SELECT ${MESSAGE_COLS} FROM mail_messages WHERE id = $1`,
    [id],
  );
  return rows[0] ? toMessage(rows[0]) : null;
}

export async function saveMessageBody(id: string, body: RustBody): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE mail_messages
     SET body_text = $1, body_html = $2, attachments_json = $3, body_fetched_at = $4,
         subject = COALESCE(NULLIF($5, ''), subject), message_id = COALESCE(NULLIF($6, ''), message_id),
         preview = COALESCE(NULLIF(preview, ''), NULLIF($8, ''))
     WHERE id = $7`,
    [
      body.text || null,
      body.html || null,
      JSON.stringify(body.attachments ?? []),
      Date.now(),
      body.subject || "",
      body.messageId || "",
      id,
      (body.text || "").replace(/\s+/g, " ").trim().slice(0, 200),
    ],
  );
}

export async function applyFlagsLocal(
  folderId: string,
  uids: number[],
  patch: { seen?: boolean; flagged?: boolean },
): Promise<void> {
  if (uids.length === 0) return;
  const db = getDb();
  const sets: string[] = [];
  const params: (string | number)[] = [folderId];
  if (patch.seen !== undefined) {
    params.push(patch.seen ? 1 : 0);
    sets.push(`seen = $${params.length}`);
  }
  if (patch.flagged !== undefined) {
    params.push(patch.flagged ? 1 : 0);
    sets.push(`flagged = $${params.length}`);
  }
  if (sets.length === 0) return;
  const holders = uids
    .map((u) => {
      params.push(u);
      return `$${params.length}`;
    })
    .join(",");
  await db.execute(
    `UPDATE mail_messages SET ${sets.join(", ")} WHERE folder_id = $1 AND uid IN (${holders})`,
    params,
  );
}

export async function removeMessagesLocal(folderId: string, uids: number[]): Promise<void> {
  if (uids.length === 0) return;
  const db = getDb();
  const params: (string | number)[] = [folderId];
  const holders = uids
    .map((u) => {
      params.push(u);
      return `$${params.length}`;
    })
    .join(",");
  await db.execute(
    `DELETE FROM mail_messages WHERE folder_id = $1 AND uid IN (${holders})`,
    params,
  );
}

export async function folderCounts(folderId: string): Promise<{ total: number; unread: number }> {
  const db = getDb();
  const rows = await db.select<{ total: number; unread: number }[]>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN seen = 0 THEN 1 ELSE 0 END) AS unread
     FROM mail_messages WHERE folder_id = $1`,
    [folderId],
  );
  return { total: rows[0]?.total ?? 0, unread: rows[0]?.unread ?? 0 };
}
