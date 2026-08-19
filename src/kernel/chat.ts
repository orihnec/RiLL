import { getDb } from "./db";
import type { ChatMsg } from "./agent/types";

/** 会话消息落库（单会话 v1：固定 sessionId）。 */
export async function saveChatMessage(msg: ChatMsg, sessionId = "default"): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO chat_messages (id, session_id, role, content, tool_calls_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      msg.id,
      sessionId,
      msg.role,
      msg.content || null,
      msg.toolCalls.length ? JSON.stringify(msg.toolCalls) : null,
      Date.now(),
    ],
  );
}
