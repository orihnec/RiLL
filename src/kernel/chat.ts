import { getDb } from "./db";
import type { ChatMsg, ToolCallView } from "./agent/types";

/** 会话概要（历史列表用）。 */
export interface SessionInfo {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}

export async function createSession(title = "新对话"): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.execute(
    "INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES ($1, $2, $3, $4)",
    [id, title, now, now],
  );
  return id;
}

export async function listSessions(): Promise<SessionInfo[]> {
  const db = getDb();
  return db.select<SessionInfo[]>(
    `SELECT s.id, s.title, s.created_at, s.updated_at,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS message_count
     FROM chat_sessions s
     ORDER BY s.updated_at DESC`,
  );
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM chat_messages WHERE session_id = $1", [id]);
  await db.execute("DELETE FROM chat_sessions WHERE id = $1", [id]);
}

/** 会话标题：首条用户消息前 24 字；仅当标题还是默认值时更新。 */
async function ensureSessionTitle(sessionId: string, content: string): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ title: string }[]>(
    "SELECT title FROM chat_sessions WHERE id = $1",
    [sessionId],
  );
  if (rows.length === 0) return;
  if (rows[0].title && rows[0].title !== "新对话") return;
  const title = content.trim().slice(0, 24) || "新对话";
  await db.execute("UPDATE chat_sessions SET title = $1, updated_at = $2 WHERE id = $3", [
    title,
    Date.now(),
    sessionId,
  ]);
}

/** 会话消息落库（按 session 分组）。 */
export async function saveChatMessage(msg: ChatMsg, sessionId: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO chat_messages (id, session_id, role, content, tool_calls_json, reasoning, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      msg.id,
      sessionId,
      msg.role,
      msg.content || null,
      msg.toolCalls.length ? JSON.stringify(msg.toolCalls) : null,
      msg.reasoning || null,
      Date.now(),
    ],
  );
  if (msg.role === "user") {
    await ensureSessionTitle(sessionId, msg.content);
    await db.execute("UPDATE chat_sessions SET updated_at = $1 WHERE id = $2", [
      Date.now(),
      sessionId,
    ]);
  }
}

/** 加载某会话的消息（按写入顺序，rowid 兜底同毫秒排序）。 */
export async function loadSessionMessages(
  sessionId: string,
  limit = 200,
): Promise<ChatMsg[]> {
  const db = getDb();
  const rows = await db.select<
    {
      id: string;
      role: string;
      content: string | null;
      tool_calls_json: string | null;
      reasoning: string | null;
    }[]
  >(
    `SELECT id, role, content, tool_calls_json, reasoning FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at ASC, rowid ASC
     LIMIT $2`,
    [sessionId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role === "user" ? "user" : "assistant",
    content: r.content ?? "",
    reasoning: r.reasoning ?? undefined,
    toolCalls: r.tool_calls_json ? (JSON.parse(r.tool_calls_json) as ToolCallView[]) : [],
  }));
}

/** 对话回退：保留到 keepMsgId（含），删除其后的所有消息。 */
export async function rollbackSession(
  sessionId: string,
  keepMsgId: string,
): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ id: string }[]>(
    "SELECT id FROM chat_messages WHERE id = $1 AND session_id = $2",
    [keepMsgId, sessionId],
  );
  if (rows.length === 0) return;
  await db.execute(
    `DELETE FROM chat_messages
     WHERE session_id = $1 AND rowid > (SELECT rowid FROM chat_messages WHERE id = $2)`,
    [sessionId, keepMsgId],
  );
  await db.execute("UPDATE chat_sessions SET updated_at = $1 WHERE id = $2", [
    Date.now(),
    sessionId,
  ]);
}

/** 消息级搜索命中（instr 精确子串匹配，无 LIKE 通配符问题）。 */
export interface ChatSearchHit {
  id: string;
  sessionId: string;
  sessionTitle: string;
  role: string;
  content: string;
  created_at: number;
}

export async function searchChat(query: string, limit = 30): Promise<ChatSearchHit[]> {
  const db = getDb();
  const rows = await db.select<
    {
      id: string;
      session_id: string;
      role: string;
      content: string | null;
      created_at: number;
      title: string;
    }[]
  >(
    `SELECT m.id, m.session_id, m.role, m.content, m.created_at, s.title
     FROM chat_messages m
     JOIN chat_sessions s ON s.id = m.session_id
     WHERE instr(m.content, $1) > 0
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [query, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    sessionTitle: r.title,
    role: r.role,
    content: r.content ?? "",
    created_at: r.created_at,
  }));
}
