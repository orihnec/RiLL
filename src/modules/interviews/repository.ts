import { newQuestion, sameContent, validateRecord, type InterviewSession, type InterviewQuestion, type InterviewRecord, type RecordKind } from "./model";

export interface InterviewDb {
  execute(sql: string, values?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T>(sql: string, values?: unknown[]): Promise<T>;
}
type Row = Record<string, unknown>;
const sessionColumns = "job_id,title,company,position,round,interview_date,format,raw_notes,summary,review_status";
const questionColumns = "session_id,sort_order,prompt,follow_ups,answer,reference_answer,reflection,tags_json,mastery";
const table = (kind: RecordKind) => kind === "session" ? "interview_sessions" : "interview_questions";
const meta = (r: Row) => ({ id: String(r.id), revision: Number(r.revision), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), deletedAt: r.deleted_at === null ? null : Number(r.deleted_at) });
export function decodeSession(r: Row): InterviewSession {
  return { ...meta(r), jobId: r.job_id === null ? null : String(r.job_id), title: String(r.title), company: String(r.company), position: String(r.position), round: String(r.round), interviewDate: r.interview_date === null ? null : String(r.interview_date), format: r.format as InterviewSession["format"], rawNotes: String(r.raw_notes), summary: String(r.summary), reviewStatus: r.review_status as InterviewSession["reviewStatus"] };
}
export function decodeQuestion(r: Row): InterviewQuestion {
  return { ...meta(r), sessionId: String(r.session_id), sortOrder: Number(r.sort_order), prompt: String(r.prompt), followUps: String(r.follow_ups), answer: String(r.answer), referenceAnswer: String(r.reference_answer), reflection: String(r.reflection), tags: JSON.parse(String(r.tags_json)), mastery: r.mastery as InterviewQuestion["mastery"] };
}
function values(kind: RecordKind, value: InterviewRecord): unknown[] {
  if (kind === "session") { const s = value as InterviewSession; return [s.jobId, s.title, s.company, s.position, s.round, s.interviewDate, s.format, s.rawNotes, s.summary, s.reviewStatus]; }
  const q = value as InterviewQuestion; return [q.sessionId, q.sortOrder, q.prompt, q.followUps, q.answer, q.referenceAnswer, q.reflection, JSON.stringify(q.tags), q.mastery];
}
export function createInterviewRepository(db: InterviewDb) {
  const read = async (kind: RecordKind, id: string): Promise<InterviewRecord | null> => {
    const rows = await db.select<Row[]>(`SELECT * FROM ${table(kind)} WHERE id=$1`, [id]);
    return rows.length ? (kind === "session" ? decodeSession(rows[0]) : decodeQuestion(rows[0])) : null;
  };
  const availableQuestion = " AND EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id=interview_questions.session_id AND s.deleted_at IS NULL)";
  return {
    read,
    async list() {
      // 包括回收站；由界面统一过滤，恢复场次时问题完整保留。
      const sessions = await db.select<Row[]>("SELECT * FROM interview_sessions ORDER BY updated_at DESC,id");
      const questions = await db.select<Row[]>("SELECT * FROM interview_questions ORDER BY sort_order,created_at,id");
      return { sessions: sessions.map(decodeSession), questions: questions.map(decodeQuestion) };
    },
    async createSession(session: InterviewSession): Promise<InterviewSession> {
      validateRecord("session", session);
      await db.execute(`INSERT OR IGNORE INTO interview_sessions (id,${sessionColumns},created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`, [session.id, ...values("session", session), session.createdAt]);
      const result = await read("session", session.id) as InterviewSession;
      if (!result || result.deletedAt !== null || !sameContent("session", session, result)) throw new Error("面经编号已被使用，请重新创建");
      return result;
    },
    async createQuestion(id: string, sessionId: string): Promise<InterviewQuestion> {
      const q = newQuestion(id, sessionId, 0);
      // 同一语句内分配顺序并检查父记录，防止新题落入已经删除的面经。
      await db.execute(`INSERT OR IGNORE INTO interview_questions (id,session_id,sort_order,created_at,updated_at)
        SELECT $1,$2,COALESCE((SELECT MAX(sort_order)+1 FROM interview_questions WHERE session_id=$2),0),$3,$3
        WHERE EXISTS (SELECT 1 FROM interview_sessions WHERE id=$2 AND deleted_at IS NULL)`, [id, sessionId, q.createdAt]);
      const result = await read("question", id) as InterviewQuestion | null;
      if (!result || result.sessionId !== sessionId || result.deletedAt !== null) throw new Error("这份面经已移入回收站，无法添加问题");
      return result;
    },
    async save(kind: RecordKind, value: InterviewRecord): Promise<InterviewRecord> {
      validateRecord(kind, value);
      const columns = (kind === "session" ? sessionColumns : questionColumns).split(",");
      const params = values(kind, value);
      params.push(Date.now(), value.id, value.revision);
      const set = columns.map((c, i) => `${c}=$${i + 1}`).join(",");
      const n = columns.length;
      const written = await db.select<Row[]>(`UPDATE ${table(kind)} SET ${set},updated_at=$${n + 1},revision=revision+1 WHERE id=$${n + 2} AND revision=$${n + 3} AND deleted_at IS NULL${kind === "question" ? availableQuestion : ""} RETURNING *`, params);
      if (written.length) return kind === "session" ? decodeSession(written[0]) : decodeQuestion(written[0]);
      const current = await read(kind, value.id);
      if (!current || current.deletedAt !== null) throw new Error("记录已移入回收站；本机草稿已保留，请恢复记录后重试");
      if (kind === "question") {
        const parent = await read("session", (value as InterviewQuestion).sessionId);
        if (!parent || parent.deletedAt !== null) throw new Error("所属面经已移入回收站；本机草稿已保留");
      }
      if (!sameContent(kind, value, current)) throw new Error("其他窗口已修改这条记录；本机草稿已保留，可导出后重新载入");
      return current;
    },
    async setDeleted(kind: RecordKind, value: InterviewRecord, deleted: boolean): Promise<InterviewRecord> {
      const rows = await db.select<Row[]>(`UPDATE ${table(kind)} SET deleted_at=$1,updated_at=$2,revision=revision+1 WHERE id=$3 AND revision=$4${kind === "question" ? availableQuestion : ""} RETURNING *`, [deleted ? Date.now() : null, Date.now(), value.id, value.revision]);
      if (!rows.length) throw new Error("记录已变化，请刷新后重试");
      return kind === "session" ? decodeSession(rows[0]) : decodeQuestion(rows[0]);
    },
  };
}
