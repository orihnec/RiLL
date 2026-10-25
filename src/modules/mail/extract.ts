/**
 * M3：AI 从邮件里识别「面试 / 笔试 / 宣讲会 / 投递截止 / offer」→ 生成**待确认候选**。
 *
 * 约定（用户拍板的，别改）：
 * 1. **绝不自动写日历** —— 这里只产出 pending 候选，用户在界面上点确认才写（confirmExtraction）。
 * 2. **正文完整发给模型**，但有两个成本闸门：单次扫描封数、单封字数（超长截断并标注）。
 * 3. 相对时间（"下周三下午两点"）必须以**邮件收到时间**为锚点解析，不是以今天为锚点。
 *
 * 纯函数（parseCandidates / normalizeCandidate）与 IO（extract* / confirm*）分开，便于无头测试。
 */
import { generateText } from "ai";
import { getChatModel, isLlmConfigured } from "../../kernel/agent/runtime";
import { getDb } from "../../kernel/db";
import { fromLocalIso, toLocalIso } from "../../lib/time";
import * as calendar from "../calendar/service";
import { listThreadMessages, saveMessageBody, rustConfigOf, fetchBody, getFolder, getMessage, type MailMessage } from "./service";

/** 单次扫描最多分析多少封（成本闸门一） */
export const MAX_MESSAGES_PER_SCAN = 50;
/** 单封最多送多少字符正文（成本闸门二） */
export const MAX_CHARS_PER_EMAIL = 20_000;

export type CandidateKind = "interview" | "written_test" | "career_talk" | "deadline" | "offer" | "other";

export const KIND_LABEL: Record<CandidateKind, string> = {
  interview: "面试",
  written_test: "笔试/测评",
  career_talk: "宣讲会",
  deadline: "截止时间",
  offer: "Offer",
  other: "其它安排",
};

const ALLOWED_KINDS = Object.keys(KIND_LABEL) as CandidateKind[];
const ALLOWED_CATEGORIES = ["default", "work", "meeting", "focus", "personal", "health", "travel", "important"];

export interface ScheduleCandidate {
  id: string;
  messageId: string;
  threadId: string | null;
  kind: CandidateKind;
  title: string;
  company: string;
  role: string;
  startAt: number | null;
  endAt: number | null;
  allDay: boolean;
  location: string;
  meetingUrl: string;
  contact: string;
  confidence: number;
  evidence: string;
  category: string;
  status: "pending" | "confirmed" | "ignored";
  eventId: string | null;
  /** 来源邮件（列表里显示"来自哪封"） */
  sourceSubject: string;
  sourceFrom: string;
  sourceDate: number;
}

/* ---------------- 纯函数：LLM 输出 → 候选 ---------------- */

export interface RawCandidate {
  kind?: unknown;
  title?: unknown;
  company?: unknown;
  role?: unknown;
  start?: unknown;
  end?: unknown;
  allDay?: unknown;
  location?: unknown;
  meetingUrl?: unknown;
  contact?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  category?: unknown;
}

const str = (v: unknown, max = 200): string =>
  typeof v === "string" ? v.trim().slice(0, max) : v === undefined || v === null ? "" : String(v).slice(0, max);

/**
 * 从模型输出里抠出 JSON 数组。
 * 兼容：纯 JSON、```json 代码块、前后有解释文字、单个对象（包成数组）。
 */
export function parseCandidates(text: string): RawCandidate[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];

  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  const candidates: string[] = [];
  // 1) ```json ... ``` 代码块
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());
  // 2) 第一个 [ 到最后一个 ]
  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) candidates.push(raw.slice(firstBracket, lastBracket + 1));
  // 3) 第一个 { 到最后一个 }
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(`[${raw.slice(firstBrace, lastBrace + 1)}]`);
  candidates.push(raw);

  for (const c of candidates) {
    const parsed = tryParse(c);
    if (Array.isArray(parsed)) return parsed as RawCandidate[];
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      // 有些模型会包一层 { candidates: [...] }
      for (const key of ["candidates", "items", "results", "events"]) {
        if (Array.isArray(obj[key])) return obj[key] as RawCandidate[];
      }
      return [parsed as RawCandidate];
    }
  }
  return [];
}

/**
 * 规范化一条候选：类型/标题/时间校验，**没有可解析时间的直接丢弃**（没有时间就没法排程）。
 */
export function normalizeCandidate(raw: RawCandidate): Omit<ScheduleCandidate, "id" | "messageId" | "threadId" | "status" | "eventId" | "sourceSubject" | "sourceFrom" | "sourceDate"> | null {
  const kindRaw = str(raw.kind, 20).toLowerCase().replace(/[\s-]/g, "_");
  const kind = (ALLOWED_KINDS as string[]).includes(kindRaw) ? (kindRaw as CandidateKind) : "other";

  const company = str(raw.company, 60);
  const role = str(raw.role, 60);
  const evidence = str(raw.evidence, 400);

  const startText = str(raw.start, 40);
  let startAt: number | null = null;
  if (startText) {
    const ms = fromLocalIso(startText);
    if (Number.isFinite(ms)) startAt = ms;
  }
  // 只有日期（YYYY-MM-DD）也算有效：按全天
  if (startAt === null) {
    const dateOnly = startText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const ms = fromLocalIso(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00`);
      if (Number.isFinite(ms)) startAt = ms;
    }
  }
  if (startAt === null) return null;

  const endText = str(raw.end, 40);
  let endAt: number | null = endText ? fromLocalIso(endText) : null;
  if (endAt !== null && !Number.isFinite(endAt)) endAt = null;

  const looksAllDay = /^\d{4}-\d{2}-\d{2}$/.test(startText) || raw.allDay === true;
  const allDay = looksAllDay && endAt === null;
  if (allDay) endAt = startAt + 24 * 3_600_000;
  if (endAt === null || endAt <= startAt) endAt = startAt + 3_600_000; // 默认 1 小时

  const catRaw = str(raw.category, 20).toLowerCase();
  const category = ALLOWED_CATEGORIES.includes(catRaw) ? catRaw : kind === "interview" || kind === "written_test" ? "important" : "default";

  let confidence = typeof raw.confidence === "number" ? raw.confidence : Number(raw.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence));

  const title = str(raw.title, 80) || [company, role, KIND_LABEL[kind]].filter(Boolean).join(" · ");

  return {
    kind,
    title,
    company,
    role,
    startAt,
    endAt,
    allDay,
    location: str(raw.location, 120),
    meetingUrl: str(raw.meetingUrl, 300),
    contact: str(raw.contact, 120),
    confidence,
    evidence,
    category,
  };
}

/* ---------------- 提示词 ---------------- */

function systemPrompt(): string {
  return [
    "你是一个求职邮件信息抽取器。用户是应届生，正在找工作，邮箱里全是投递回执、笔试、面试、宣讲会通知。",
    "你的任务：从给定的邮件里找出**需要用户到时参加或在某个时间点之前完成**的安排，输出结构化候选。",
    "",
    "严格输出 JSON 数组，不要输出任何解释文字。数组元素字段：",
    `{"uid":"这封邮件的 UID（照抄上面『邮件UID』）",`,
    ` "kind":"interview|written_test|career_talk|deadline|offer|other",`,
    ` "title":"简短中文标题，如『字节跳动 · 模型训练实习 一面』",`,
    ` "company":"公司名","role":"岗位名",`,
    ` "start":"本地时间 2026-10-12T14:00（只有日期就写 2026-10-12）",`,
    ` "end":"同上，可省略","allDay":false,`,
    ` "location":"线下地点","meetingUrl":"线上会议链接","contact":"联系人/电话/邮箱",`,
    ` "confidence":0.0-1.0,"evidence":"邮件里支持这个时间的原句（照抄，不要改写）",`,
    ` "category":"default|work|meeting|focus|personal|health|travel|important"}`,
    "",
    "硬性要求：",
    "1. **时间必须是确定的具体时间**。邮件说『另行通知』『待定』『尽快』这类没有具体时间的，**不要输出**。",
    "2. 相对时间（今天/下周三/后天）要**以该封邮件的收到时间为锚点**换算成具体日期，并在 evidence 里给出原句。",
    "3. 一封邮件里可能有多条安排（比如同时有笔试链接和面试时间），都要输出。",
    "4. 没有安排的邮件（纯广告、回执、感谢投递）返回 `[]`。",
    "5. 宁缺毋滥：不确定的时间不要猜；只写邮件里明确写了的时间。",
  ].join("\n");
}

function userPrompt(messages: MailMessage[]): string {
  const now = new Date();
  const parts: string[] = [
    `当前本地时间：${toLocalIso(now.getTime())}（星期${"日一二三四五六"[now.getDay()]}）`,
    `下面是 ${messages.length} 封邮件，按时间从早到晚：`,
  ];
  for (const m of messages) {
    const body = (m.bodyText ?? "").replace(/\s+/g, " ").trim();
    const clipped = body.length > MAX_CHARS_PER_EMAIL ? `${body.slice(0, MAX_CHARS_PER_EMAIL)}…（已截断）` : body;
    parts.push(
      [
        "-----",
        `邮件UID：${m.uid}`,
        `收到时间：${toLocalIso(m.date)}（星期${"日一二三四五六"[new Date(m.date).getDay()]}）`,
        `发件人：${m.fromName || ""} <${m.fromAddress || ""}>`,
        `主题：${m.subject || "(无主题)"}`,
        `正文：${clipped || "(无纯文本正文)"}`,
      ].join("\n"),
    );
  }
  return parts.join("\n");
}

/* ---------------- IO：扫描与落库 ---------------- */

export interface ScanEstimate {
  messages: number;
  chars: number;
  skippedNoBody: number;
}

/** 扫描前的成本预估（前端先给用户看，再决定要不要发）。 */
export async function estimateScan(folderId: string, limit = 20): Promise<ScanEstimate> {
  const db = getDb();
  const rows = await db.select<{ n: number; chars: number }[]>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(COALESCE(body_text, ''))), 0) AS chars
     FROM (SELECT body_text FROM mail_messages
           WHERE folder_id = $1 AND ai_analyzed_at IS NULL AND body_fetched_at IS NOT NULL
           ORDER BY date DESC LIMIT ${Math.max(1, Math.min(limit, MAX_MESSAGES_PER_SCAN))})`,
    [folderId],
  );
  const noBody = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM mail_messages
     WHERE folder_id = $1 AND ai_analyzed_at IS NULL AND body_fetched_at IS NULL`,
    [folderId],
  );
  return {
    messages: rows[0]?.n ?? 0,
    chars: rows[0]?.chars ?? 0,
    skippedNoBody: noBody[0]?.n ?? 0,
  };
}

interface StoredRow {
  id: string;
  account_id: string;
  message_id: string;
  thread_id: string | null;
  kind: string;
  title: string;
  company: string | null;
  role: string | null;
  start_at: number | null;
  end_at: number | null;
  all_day: number;
  location: string | null;
  meeting_url: string | null;
  contact: string | null;
  confidence: number;
  evidence: string | null;
  category: string | null;
  status: string;
  event_id: string | null;
  subject: string | null;
  from_address: string | null;
  date: number;
}

function toCandidate(r: StoredRow): ScheduleCandidate {
  return {
    id: r.id,
    messageId: r.message_id,
    threadId: r.thread_id,
    kind: (ALLOWED_KINDS as string[]).includes(r.kind) ? (r.kind as CandidateKind) : "other",
    title: r.title,
    company: r.company ?? "",
    role: r.role ?? "",
    startAt: r.start_at,
    endAt: r.end_at,
    allDay: r.all_day === 1,
    location: r.location ?? "",
    meetingUrl: r.meeting_url ?? "",
    contact: r.contact ?? "",
    confidence: r.confidence,
    evidence: r.evidence ?? "",
    category: r.category ?? "default",
    status: (r.status as ScheduleCandidate["status"]) ?? "pending",
    eventId: r.event_id,
    sourceSubject: r.subject ?? "",
    sourceFrom: r.from_address ?? "",
    sourceDate: r.date,
  };
}

const SELECT_COLS = `e.id, e.account_id, e.message_id, e.thread_id, e.kind, e.title, e.company, e.role,
  e.start_at, e.end_at, e.all_day, e.location, e.meeting_url, e.contact, e.confidence, e.evidence,
  e.category, e.status, e.event_id, m.subject, m.from_address, m.date`;

export async function listCandidates(
  status: "pending" | "confirmed" | "ignored" | "all" = "pending",
  limit = 100,
): Promise<ScheduleCandidate[]> {
  const db = getDb();
  const where = status === "all" ? "" : "WHERE e.status = $1";
  const params: (string | number)[] = status === "all" ? [] : [status];
  params.push(Math.min(Math.max(limit, 1), 300));
  const rows = await db.select<StoredRow[]>(
    `SELECT ${SELECT_COLS} FROM mail_extractions e
     JOIN mail_messages m ON m.id = e.message_id
     ${where}
     ORDER BY (e.start_at IS NULL) ASC, e.start_at ASC, e.confidence DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(toCandidate);
}

export async function pendingCount(): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM mail_extractions WHERE status = 'pending'",
  );
  return rows[0]?.n ?? 0;
}

/** 调一次模型，抽一批邮件里的安排（返回落库条数）。 */
export async function extractFromMessages(
  messages: MailMessage[],
  onProgress?: (text: string) => void,
): Promise<{ candidates: number; scanned: number }> {
  if (!isLlmConfigured()) {
    throw new Error("还没配置模型：设置 → 模型里填好 Base URL / 模型名 / API Key 才能用 AI 识别");
  }
  const usable = messages.filter((m) => (m.bodyText ?? "").trim().length > 0 || (m.bodyHtml ?? "").trim().length > 0);
  if (usable.length === 0) return { candidates: 0, scanned: 0 };

  onProgress?.(`正在让模型读 ${usable.length} 封邮件…`);
  const res = await generateText({
    model: getChatModel(),
    system: systemPrompt(),
    prompt: userPrompt(usable),
    temperature: 0,
  });

  const raws = parseCandidates(res.text ?? "");
  const db = getDb();
  const now = Date.now();
  let stored = 0;
  const accountId = usable[0].accountId;

  for (const raw of raws) {
    const norm = normalizeCandidate(raw);
    if (!norm) continue;
    // 归属到哪封邮件：优先按模型给的 UID 找，找不到就归给最后（最新）一封
    const uid = Number((raw as Record<string, unknown>).uid ?? (raw as Record<string, unknown>).emailUid);
    const owner = usable.find((m) => m.uid === uid) ?? usable[usable.length - 1];
    const id = crypto.randomUUID();
    try {
      await db.execute(
        `INSERT INTO mail_extractions
           (id, account_id, message_id, thread_id, kind, title, company, role, start_at, end_at, all_day,
            location, meeting_url, contact, confidence, evidence, category, raw_json, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'pending',$19,$19)
         ON CONFLICT(message_id, kind, start_at) DO UPDATE SET
           title = excluded.title, company = excluded.company, role = excluded.role,
           end_at = excluded.end_at, all_day = excluded.all_day, location = excluded.location,
           meeting_url = excluded.meeting_url, contact = excluded.contact,
           confidence = excluded.confidence, evidence = excluded.evidence,
           category = excluded.category, raw_json = excluded.raw_json, updated_at = excluded.updated_at`,
        [
          id,
          accountId,
          owner.id,
          owner.threadId,
          norm.kind,
          norm.title,
          norm.company || null,
          norm.role || null,
          norm.startAt,
          norm.endAt,
          norm.allDay ? 1 : 0,
          norm.location || null,
          norm.meetingUrl || null,
          norm.contact || null,
          norm.confidence,
          norm.evidence || null,
          norm.category,
          JSON.stringify(raw),
          now,
        ],
      );
      stored += 1;
    } catch (e) {
      console.warn("[mail] 候选入库失败", e);
    }
  }

  // 标记已分析（没抽出东西的也算分析过，避免反复烧钱）
  const ids = usable.map((m) => m.id);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const holders = chunk.map((_, j) => `$${j + 2}`).join(",");
    await db.execute(`UPDATE mail_messages SET ai_analyzed_at = $1 WHERE id IN (${holders})`, [
      now,
      ...chunk,
    ]);
  }
  return { candidates: stored, scanned: usable.length };
}

/** 扫描一个会话（"AI 识别这场会话"）。正文没缓存会先自动取。 */
export async function extractThread(
  threadId: string,
  onProgress?: (text: string) => void,
): Promise<{ candidates: number; scanned: number }> {
  let messages = await listThreadMessages(threadId);
  const missing = messages.filter((m) => !m.bodyFetchedAt);
  if (missing.length > 0) {
    onProgress?.(`先取 ${missing.length} 封正文…`);
    const cfg = await rustConfigOf(missing[0].accountId);
    for (const m of missing) {
      try {
        const folder = await getFolder(m.folderId);
        if (!folder) continue;
        const body = await fetchBody(cfg, folder.raw, m.uid);
        await saveMessageBody(m.id, body);
      } catch (e) {
        console.warn("[mail] 取正文失败", m.uid, e);
      }
    }
    messages = await listThreadMessages(threadId);
  }
  return extractFromMessages(messages, onProgress);
}

/** 扫描文件夹里"最近且还没分析过"的邮件。 */
export async function scanFolder(
  folderId: string,
  limit = 20,
  onProgress?: (text: string) => void,
): Promise<{ candidates: number; scanned: number }> {
  const db = getDb();
  const ids = await db.select<{ id: string }[]>(
    `SELECT id FROM mail_messages
     WHERE folder_id = $1 AND ai_analyzed_at IS NULL AND body_fetched_at IS NOT NULL
     ORDER BY date DESC LIMIT ${Math.max(1, Math.min(limit, MAX_MESSAGES_PER_SCAN))}`,
    [folderId],
  );
  if (ids.length === 0) return { candidates: 0, scanned: 0 };
  // 按 date 升序喂给模型（便于理解上下文）；用 getMessage 走统一的行映射，别手搓字段
  const messages: MailMessage[] = [];
  for (const r of ids) {
    const m = await getMessage(r.id);
    if (m) messages.push(m);
  }
  messages.sort((a, b) => a.date - b.date);
  return extractFromMessages(messages, onProgress);
}

/* ---------------- 确认 / 忽略 ---------------- */

export interface ConfirmPatch {
  title?: string;
  startAt?: number;
  endAt?: number;
  allDay?: boolean;
  location?: string;
  category?: string;
}

/**
 * **确认并写入日历**（用户点了确认才会走到这里）。
 * 事件备注里带上来源邮件与依据原句，方便以后回查。
 *
 * 幂等保证：同一条候选无论确认多少次，都只对应一个日程 ——
 * 已确认过且没改内容就直接返回原事件 id；改了时间/标题就**移动原日程**而不是新建
 * （否则智能体重试或用户连点会写出重复日程）。
 */
export async function confirmExtraction(id: string, patch?: ConfirmPatch): Promise<string> {
  const db = getDb();
  const rows = await db.select<StoredRow[]>(
    `SELECT ${SELECT_COLS} FROM mail_extractions e JOIN mail_messages m ON m.id = e.message_id WHERE e.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error("这条候选不存在（可能已被删除）");

  const startAt = patch?.startAt ?? row.start_at;
  if (startAt === null || !Number.isFinite(startAt)) {
    throw new Error("这条候选没有可用时间，请先补一个时间再确认");
  }
  const allDay = patch?.allDay ?? row.all_day === 1;
  let endAt = patch?.endAt ?? row.end_at ?? null;
  if (allDay) endAt = startAt + 24 * 3_600_000;
  if (endAt === null || endAt <= startAt) endAt = startAt + 3_600_000;
  const title = patch?.title?.trim() || row.title;
  const category = patch?.category ?? row.category ?? "important";

  const notes = [
    row.evidence ? `依据原文：${row.evidence}` : "",
    row.location ? `地点：${row.location}` : "",
    row.meeting_url ? `会议链接：${row.meeting_url}` : "",
    row.contact ? `联系人：${row.contact}` : "",
    row.company ? `公司：${row.company}` : "",
    row.role ? `岗位：${row.role}` : "",
    `来源邮件：${row.subject ?? "(无主题)"} · ${row.from_address ?? ""} · ${toLocalIso(row.date)}`,
    "（由邮箱 AI 识别，已在邮件面板里人工确认）",
  ]
    .filter(Boolean)
    .join("\n");

  // 已确认过：不改就返回原事件；改了就把原日程挪过去（避免重复建）
  if (row.status === "confirmed" && row.event_id) {
    const untouched =
      !patch ||
      (patch.title === undefined &&
        patch.startAt === undefined &&
        patch.endAt === undefined &&
        patch.allDay === undefined &&
        patch.category === undefined);
    if (!untouched) {
      await calendar.updateEvent({ id: row.event_id }, { title, startAt, endAt, allDay, category, notes });
      await db.execute(
        `UPDATE mail_extractions SET start_at = $1, end_at = $2, all_day = $3, title = $4,
           category = $5, updated_at = $6 WHERE id = $7`,
        [startAt, endAt, allDay ? 1 : 0, title, category, Date.now(), id],
      );
    }
    return row.event_id;
  }

  const eventId = await calendar.createEvent({ title, startAt, endAt, allDay, category, notes });

  await db.execute(
    `UPDATE mail_extractions SET status = 'confirmed', event_id = $1,
       start_at = $2, end_at = $3, all_day = $4,
       title = $5, category = $6, updated_at = $7
     WHERE id = $8`,
    [eventId, startAt, endAt, allDay ? 1 : 0, title, category, Date.now(), id],
  );
  return eventId;
}

export async function ignoreExtraction(id: string): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE mail_extractions SET status = 'ignored', updated_at = $1 WHERE id = $2", [
    Date.now(),
    id,
  ]);
}

export async function deleteExtraction(id: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM mail_extractions WHERE id = $1", [id]);
}

/** 确认过的候选里撤销（同时删掉写进去的日程）。 */
export async function undoExtraction(id: string): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ event_id: string | null }[]>(
    "SELECT event_id FROM mail_extractions WHERE id = $1",
    [id],
  );
  const eventId = rows[0]?.event_id;
  if (eventId) await calendar.deleteEvent({ id: eventId }).catch(() => undefined);
  await db.execute(
    "UPDATE mail_extractions SET status = 'pending', event_id = NULL, updated_at = $1 WHERE id = $2",
    [Date.now(), id],
  );
}
