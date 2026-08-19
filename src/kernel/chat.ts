import { getDb } from "./db";
import type { ChatMsg, ToolCallView } from "./agent/types";

/** 会话消息落库（单会话 v1：固定 sessionId）。 */
export async function saveChatMessage(msg: ChatMsg, sessionId = "default"): Promise<void> {
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
}

/** 恢复最近会话（按写入顺序，rowid 兜底同毫秒排序）。 */
export async function loadRecentChatMessages(
  limit = 100,
  sessionId = "default",
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
