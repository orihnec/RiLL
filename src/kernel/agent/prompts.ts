import { getDb } from "../db";

/** 组装 system prompt：当前时间 + 时区 + active 偏好 + 技能 + 行为约束。 */
export async function buildSystemPrompt(): Promise<string> {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  let prefs: string[] = [];
  let skills: string[] = [];
  try {
    const db = getDb();
    const p = await db.select<{ content: string }[]>(
      "SELECT content FROM preferences WHERE status = 'active' ORDER BY confidence DESC",
    );
    prefs = p.map((r) => r.content);
    const s = await db.select<{ name: string; description: string | null }[]>(
      "SELECT name, description FROM skills",
    );
    skills = s.map((x) => (x.description ? `${x.name}：${x.description}` : x.name));
  } catch {
    // 表未就绪时忽略（早期启动路径）
  }

  return [
    "你是 RiliAgent，一款本地个人日程管理应用的 AI 助手。",
    `当前时间：${now.toLocaleString("zh-CN")}；时区：${tz}（所有时间按本地时区解释，回复用中文）。`,
    "你可以使用工具操作日程。规则：",
    "1. 创建类操作（calendar_createEvent）可直接执行；",
    "2. 修改/删除类操作（calendar_updateEvent / calendar_deleteEvent）必须先向用户复述将要执行的变更，等待用户明确确认后再调用工具；",
    "3. 用户没提供 id 时，先用 calendar_listEvents 找到目标再操作；",
    "4. 用户说'随便/你定'时，用 calendar_findFreeSlots 找合适时间并给出建议。",
    prefs.length
      ? `用户偏好（生效中，必须遵守）：\n${prefs.map((x) => `- ${x}`).join("\n")}`
      : "用户偏好：（暂无）",
    skills.length ? `可用技能：${skills.join("、")}` : "",
    "回复保持简洁，使用中文。",
  ]
    .filter(Boolean)
    .join("\n");
}
