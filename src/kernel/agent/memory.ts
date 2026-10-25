import { generateText } from "ai";
import { errMsg } from "../../lib/error";
import { getDb } from "../db";
import { getChatModel, isLlmConfigured } from "./runtime";

/**
 * M4 自迭代核心：event_edits 隐式信号 → LLM 反思生成偏好（pending）→ 用户确认生效（active）。
 * 技能沉淀（≥3 次工具组合）、90 天自动归档、偏好/技能 CRUD。
 */

export interface Preference {
  id: string;
  content: string;
  confidence: number;
  status: "pending" | "active" | "archived";
  created_at: number;
  updated_at: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  spec_json: string;
  use_count: number;
}

/* ---------------- 偏好 CRUD ---------------- */

export async function listPreferences(): Promise<Preference[]> {
  const db = getDb();
  return db.select<Preference[]>(
    "SELECT id, content, confidence, status, created_at, updated_at FROM preferences ORDER BY created_at DESC",
  );
}

export async function setPreferenceStatus(id: string, status: Preference["status"]): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE preferences SET status = $1, updated_at = $2 WHERE id = $3", [
    status,
    Date.now(),
    id,
  ]);
}

export async function updatePreferenceContent(id: string, content: string): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE preferences SET content = $1, updated_at = $2 WHERE id = $3", [
    content,
    Date.now(),
    id,
  ]);
}

export async function deletePreference(id: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM preferences WHERE id = $1", [id]);
}

export async function addPreference(content: string, confidence: number): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.execute(
    `INSERT INTO preferences (id, content, confidence, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, $4)`,
    [id, content.trim(), confidence, now],
  );
  return id;
}

/* ---------------- 技能 ---------------- */

export async function listSkills(): Promise<Skill[]> {
  const db = getDb();
  return db.select<Skill[]>("SELECT id, name, description, spec_json, use_count FROM skills ORDER BY use_count DESC");
}

export async function deleteSkill(id: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM skills WHERE id = $1", [id]);
}

/**
 * 技能沉淀：统计对话中"用户请求 → 同轮工具调用组合"的出现次数，≥3 次沉淀为技能。
 * 返回新建技能数。
 */
export async function distillSkills(): Promise<{ created: number }> {
  const db = getDb();
  const rows = await db.select<{ tool_calls_json: string | null }[]>(
    `SELECT tool_calls_json FROM chat_messages
     WHERE role = 'assistant' AND tool_calls_json IS NOT NULL`,
  );
  const counts = new Map<string, number>();
  for (const r of rows) {
    try {
      const calls = JSON.parse(r.tool_calls_json ?? "[]") as { name?: string }[];
      const names = [...new Set(calls.map((c) => c.name).filter(Boolean) as string[])].sort();
      if (names.length === 0) continue;
      const key = names.join("+");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    } catch {
      // 忽略损坏的行
    }
  }
  let created = 0;
  for (const [key, n] of counts) {
    if (n < 3) continue;
    const existing = await db.select<{ id: string }[]>(
      "SELECT id FROM skills WHERE spec_json = $1",
      [JSON.stringify({ combo: key })],
    );
    if (existing.length > 0) {
      await db.execute("UPDATE skills SET use_count = $1 WHERE id = $2", [n, existing[0].id]);
      continue;
    }
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO skills (id, name, description, spec_json, use_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        key,
        `用户已在对话中 ${n} 次通过该工具组合完成任务，可主动复用：${key.split("+").join("、")}`,
        JSON.stringify({ combo: key }),
        n,
      ],
    );
    created++;
  }
  return { created };
}

/* ---------------- 90 天归档 ---------------- */

const ARCHIVE_DAYS = 90;

/** pending 偏好超过 90 天无确认 → 自动归档。 */
export async function archiveStalePreferences(): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    "UPDATE preferences SET status = 'archived', updated_at = $1 WHERE status = 'pending' AND created_at < $2",
    [Date.now(), Date.now() - ARCHIVE_DAYS * 24 * 3_600_000],
  );
  return res.rowsAffected;
}

/* ---------------- 反思（event_edits → LLM → pending 偏好） ---------------- */

interface EditRow {
  event_id: string;
  title: string | null;
  field: string;
  before_val: string | null;
  after_val: string | null;
  via_agent: number;
  created_at: number;
}

function fmtVal(field: string, v: string | null): string {
  if (v === null || v === "") return "（空）";
  if (field === "start_at" || field === "end_at") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 1e11) {
      return new Date(n).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  if (field === "all_day") return v === "1" ? "全天" : "定时";
  return v;
}

/** 读取最近编辑记录并格式化为可读文本（时间戳转本地时间）。 */
async function loadEditSummary(limit = 60): Promise<string> {
  const db = getDb();
  const rows = await db.select<EditRow[]>(
    `SELECT e.event_id, ev.title, e.field, e.before_val, e.after_val, e.via_agent, e.created_at
     FROM event_edits e LEFT JOIN events ev ON ev.id = e.event_id
     ORDER BY e.created_at DESC LIMIT $1`,
    [limit],
  );
  if (rows.length === 0) return "";
  return rows
    .reverse()
    .map(
      (r) =>
        `- 事件「${r.title ?? "(已删除)"}」：${r.field} 由「${fmtVal(r.field, r.before_val)}」改为「${fmtVal(r.field, r.after_val)}」${r.via_agent ? "（用户手动修正了 AI 的安排）" : ""}`,
    )
    .join("\n");
}

function parsePreferenceJson(text: string): { content: string; confidence: number }[] {
  const m = /\[[\s\S]*\]/.exec(text);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as { content?: unknown; confidence?: unknown }[];
    return arr
      .filter((x) => typeof x.content === "string" && x.content.trim().length > 0)
      .map((x) => ({
        content: String(x.content).trim(),
        confidence:
          typeof x.confidence === "number" && x.confidence >= 0 && x.confidence <= 1
            ? x.confidence
            : 0.6,
      }));
  } catch {
    return [];
  }
}

/**
 * 反思：读取 event_edits 摘要 → LLM 归纳用户偏好（status=pending，等用户确认）。
 * 需要 LLM 已配置；via_agent diff ≥ 20 时自动触发，也可手动。
 */
export async function runReflection(): Promise<{ created: number; error?: string }> {
  if (!isLlmConfigured()) {
    return { created: 0, error: "未配置 LLM，无法运行反思" };
  }
  const summary = await loadEditSummary();
  if (!summary) {
    return { created: 0, error: "暂无编辑记录可反思" };
  }

  const system =
    "你是 Rill 的记忆分析器。根据用户对日历事件的编辑记录，归纳出 1-5 条可长期遵循的" +
    "日程偏好（如固定开会时间、标题风格、类别习惯、时长习惯）。规则：只归纳有充分证据的偏好；" +
    "只输出 JSON 数组，不要输出任何其他文字；每条形如 {\"content\": \"偏好描述（中文，简洁具体）\", \"confidence\": 0.0-1.0}。" +
    "示例：{\"content\": \"用户习惯把会议安排在下午，且时长 1 小时\", \"confidence\": 0.8}";

  try {
    const res = await generateText({
      model: getChatModel(),
      system,
      prompt: `以下是用户最近的日程编辑记录：\n${summary}`,
      temperature: 0.3,
      timeout: 30_000,
    });
    const parsed = parsePreferenceJson(res.text);
    const db = getDb();
    const existing = await db.select<{ content: string }[]>(
      "SELECT content FROM preferences WHERE status IN ('pending', 'active')",
    );
    const known = new Set(existing.map((r) => r.content.trim()));
    let created = 0;
    for (const p of parsed) {
      if (known.has(p.content)) continue;
      await addPreference(p.content, p.confidence);
      known.add(p.content);
      created++;
    }
    return { created };
  } catch (e) {
    console.error("[memory] reflection failed:", e);
    return { created: 0, error: errMsg(e) };
  }
}

/** 未确认的 via_agent diff 累计数（自动反思阈值判断用）。 */
export async function countUnreflectedAgentEdits(): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM event_edits WHERE via_agent = 1",
  );
  return rows[0]?.n ?? 0;
}
