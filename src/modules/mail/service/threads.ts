import { assignThreads, type ThreadMessage } from "../threading";
import { getAccount } from "./accounts";
import { getDb } from "../../../kernel/db";
import { getFolder } from "./folders";
import { MESSAGE_COLS } from "./consts";
import { parseJsonArray, toMessage } from "./messages";
import type { MailMessage, MessageRow } from "./types";

export interface MailThread {
  threadId: string;
  /** 展示用主题（取最新一封） */
  subject: string;
  /** 参与者（去重后的显示名 + 地址） */
  participants: { name: string; address: string }[];
  messageCount: number;
  unreadCount: number;
  latestDate: number;
  earliestDate: number;
  latestUid: number;
  flagged: boolean;
  /** 最新一封的摘要（正文缓存后才有） */
  snippet: string;
  /** 最新一封的本地 id（打开会话时定位） */
  latestMessageId: string;
}

export async function recomputeThreads(folderId: string): Promise<number> {
  const db = getDb();
  const rows = await db.select<MessageRow[]>(
    `SELECT ${MESSAGE_COLS} FROM mail_messages WHERE folder_id = $1`,
    [folderId],
  );
  if (rows.length === 0) return 0;

  // 本邮箱自己的地址：同主题合并时要排除掉，否则所有发给我的同主题邮件会糊成一条
  const folder = await getFolder(folderId);
  const own = new Set<string>();
  if (folder) {
    const account = await getAccount(folder.accountId);
    if (account) {
      own.add(account.email.toLowerCase());
      own.add(account.username.toLowerCase());
    }
  }

  const msgs: ThreadMessage[] = rows.map((r) => ({
    id: r.id,
    messageId: r.message_id,
    references: parseJsonArray(r.references_json),
    inReplyTo: r.in_reply_to,
    subject: r.subject,
    date: r.date,
    participants: [r.from_address ?? "", r.to_address ?? ""].filter(Boolean),
  }));
  const assigned = assignThreads(msgs, [...own]);

  // 只更新变化的行（批量 CASE WHEN，避免上千条单语句）
  const changed = rows.filter((r) => (r.thread_id ?? null) !== (assigned.get(r.id) ?? null));
  const BATCH = 60;
  for (let i = 0; i < changed.length; i += BATCH) {
    const chunk = changed.slice(i, i + BATCH);
    const holders = chunk.map((_, j) => `$${j * 2 + 1}`).join(",");
    const cases = chunk.map((_, j) => `WHEN $${j * 2 + 1} THEN $${j * 2 + 2}`).join(" ");
    const params: string[] = [];
    for (const r of chunk) params.push(r.id, assigned.get(r.id) ?? "");
    await db.execute(
      `UPDATE mail_messages SET thread_id = CASE id ${cases} END WHERE id IN (${holders})`,
      params,
    );
  }
  return changed.length;
}

export async function listThreads(opts: {
  folderId: string;
  keyword?: string;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ rows: MailThread[]; total: number }> {
  const db = getDb();
  const where = ["m.folder_id = $1"];
  const params: (string | number)[] = [opts.folderId];

  const kw = opts.keyword?.trim();
  if (kw) {
    params.push(`%${kw.replace(/[\\%_]/g, (x) => `\\${x}`)}%`);
    const p = `$${params.length}`;
    where.push(
      `m.thread_id IN (SELECT DISTINCT thread_id FROM mail_messages
         WHERE folder_id = $1 AND (subject LIKE ${p} ESCAPE '\\' OR from_name LIKE ${p} ESCAPE '\\'
           OR from_address LIKE ${p} ESCAPE '\\' OR preview LIKE ${p} ESCAPE '\\'
           OR body_text LIKE ${p} ESCAPE '\\'))`,
    );
  }
  const clause = `WHERE ${where.join(" AND ")}`;
  const having = opts.unreadOnly ? "HAVING SUM(CASE WHEN m.seen = 0 THEN 1 ELSE 0 END) > 0" : "";

  const counted = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM (
       SELECT COALESCE(m.thread_id, 'row:' || m.id) AS tid FROM mail_messages m
       ${clause} GROUP BY tid ${having}
     )`,
    params,
  );
  const total = counted[0]?.n ?? 0;

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const groups = await db.select<{ tid: string; latest: number }[]>(
    `SELECT COALESCE(m.thread_id, 'row:' || m.id) AS tid, MAX(m.date) AS latest
     FROM mail_messages m ${clause} GROUP BY tid ${having}
     ORDER BY latest DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  if (groups.length === 0) return { rows: [], total };

  // 取这些会话的全部消息（顺序取回后在内存里聚合，避免 N+1）
  const ids = groups.map((g) => g.tid);
  const holders = ids.map((_, j) => `$${j + 2}`).join(",");
  const all = await db.select<MessageRow[]>(
    `SELECT ${MESSAGE_COLS} FROM mail_messages
     WHERE folder_id = $1 AND COALESCE(thread_id, 'row:' || id) IN (${holders})
     ORDER BY date DESC`,
    [opts.folderId, ...ids],
  );

  const byThread = new Map<string, MailMessage[]>();
  for (const r of all) {
    const m = toMessage(r);
    const key = m.threadId ?? `row:${m.id}`;
    const list = byThread.get(key);
    if (list) list.push(m);
    else byThread.set(key, [m]);
  }

  const rows: MailThread[] = [];
  for (const g of groups) {
    const list = byThread.get(g.tid);
    if (!list || list.length === 0) continue;
    const latest = list[0]; // 已按 date DESC
    const seenAddr = new Set<string>();
    const participants: { name: string; address: string }[] = [];
    for (const m of list) {
      for (const [name, address] of [
        [m.fromName, m.fromAddress],
        [null, m.toAddress],
      ] as [string | null, string | null][]) {
        const addr = (address ?? "").trim().toLowerCase();
        if (!addr || seenAddr.has(addr)) continue;
        seenAddr.add(addr);
        participants.push({ name: name ?? "", address: addr });
      }
    }
    rows.push({
      threadId: g.tid,
      subject: latest.subject ?? "(无主题)",
      participants: participants.slice(0, 6),
      messageCount: list.length,
      unreadCount: list.filter((m) => !m.seen).length,
      latestDate: latest.date,
      earliestDate: list[list.length - 1].date,
      latestUid: latest.uid,
      flagged: list.some((m) => m.flagged),
      snippet: latest.preview || latest.bodyText?.slice(0, 200) || "",
      latestMessageId: latest.id,
    });
  }
  return { rows, total };
}

export async function listThreadMessages(threadId: string): Promise<MailMessage[]> {
  const db = getDb();
  // 还没线程化的邮件在列表里用合成 id `row:<本地行 id>`（见 listThreads），
  // 这里必须能反解出来——否则点了会话会得到一个空白右栏（曾经的真实 bug）。
  const bareId = threadId.startsWith("row:") ? threadId.slice(4) : threadId;
  const rows = await db.select<MessageRow[]>(
    `SELECT ${MESSAGE_COLS} FROM mail_messages
     WHERE thread_id = $1 OR id = $1 OR id = $2
     ORDER BY date ASC, uid ASC`,
    [threadId, bareId],
  );
  return rows.map(toMessage);
}

export async function threadIdOfMessage(messageId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select<{ thread_id: string | null }[]>(
    "SELECT thread_id FROM mail_messages WHERE id = $1",
    [messageId],
  );
  return rows[0]?.thread_id ?? null;
}

export async function healThreads(limitFolders = 50): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ folder_id: string; n: number }[]>(
    `SELECT folder_id, COUNT(*) AS n FROM mail_messages
     WHERE thread_id IS NULL GROUP BY folder_id LIMIT ${Math.max(1, Math.min(limitFolders, 200))}`,
  );
  let updated = 0;
  for (const r of rows) {
    try {
      updated += await recomputeThreads(r.folder_id);
    } catch (e) {
      console.warn("[mail] 会话自愈失败", r.folder_id, e);
    }
  }
  return updated;
}
