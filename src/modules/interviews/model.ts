import { z } from "zod";

export const REVIEW_STATES = { draft: "草稿", reviewing: "复盘中", reviewed: "已复盘" } as const;
export const MASTERY = { unrated: "未评估", needs_work: "需加强", familiar: "基本掌握", mastered: "熟练" } as const;
export const FORMATS = { unknown: "暂未填写", online: "线上", onsite: "现场", phone: "电话" } as const;
export type ReviewState = keyof typeof REVIEW_STATES;
export type Mastery = keyof typeof MASTERY;
export interface RecordMeta { id: string; revision: number; createdAt: number; updatedAt: number; deletedAt: number | null }
export interface InterviewSession extends RecordMeta {
  jobId: string | null; title: string; company: string; position: string; round: string;
  interviewDate: string | null; format: keyof typeof FORMATS; rawNotes: string; summary: string; reviewStatus: ReviewState;
}
export interface InterviewQuestion extends RecordMeta {
  sessionId: string; sortOrder: number; prompt: string; followUps: string; answer: string;
  referenceAnswer: string; reflection: string; tags: string[]; mastery: Mastery;
}
export type InterviewRecord = InterviewSession | InterviewQuestion;
export type RecordKind = "session" | "question";
export type ApplicationChoice = { id: string; company: string; position: string };
export const SESSION_FIELDS = ["jobId", "title", "company", "position", "round", "interviewDate", "format", "rawNotes", "summary", "reviewStatus"] as const;
export const QUESTION_FIELDS = ["sessionId", "sortOrder", "prompt", "followUps", "answer", "referenceAnswer", "reflection", "tags", "mastery"] as const;
const text = z.string().max(200_000, "单项内容最多 20 万字符");
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) && date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
}
const sessionSchema = z.object({
  jobId: z.string().nullable(), title: z.string().max(300), company: z.string().max(300), position: z.string().max(500), round: z.string().max(100),
  interviewDate: z.string().refine(validDate, "面试日期无效，可清空后再补录").nullable(), format: z.enum(["unknown", "online", "onsite", "phone"]),
  rawNotes: text, summary: text, reviewStatus: z.enum(["draft", "reviewing", "reviewed"]),
});
const questionSchema = z.object({ sessionId: z.string().min(1), sortOrder: z.number().int().nonnegative(), prompt: text, followUps: text,
  answer: text, referenceAnswer: text, reflection: text, tags: z.array(z.string().min(1).max(40, "标签最多 40 个字符")).max(20, "每道题最多 20 个标签"), mastery: z.enum(["unrated", "needs_work", "familiar", "mastered"]) });
export function validateRecord(kind: RecordKind, value: InterviewRecord): void {
  const result = kind === "session" ? sessionSchema.safeParse(value) : questionSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0].message);
}
export function sameContent(kind: RecordKind, a: InterviewRecord, b: InterviewRecord): boolean {
  const fields = kind === "session" ? SESSION_FIELDS : QUESTION_FIELDS;
  return fields.every(key => JSON.stringify((a as unknown as Record<string, unknown>)[key]) === JSON.stringify((b as unknown as Record<string, unknown>)[key]));
}
export function newSession(id: string, job?: ApplicationChoice, now = Date.now()): InterviewSession {
  return { id, jobId: job?.id ?? null, title: "", company: job?.company ?? "", position: job?.position ?? "", round: "", interviewDate: null,
    format: "unknown", rawNotes: "", summary: "", reviewStatus: "draft", revision: 0, createdAt: now, updatedAt: now, deletedAt: null };
}
export function newQuestion(id: string, sessionId: string, sortOrder: number, now = Date.now()): InterviewQuestion {
  return { id, sessionId, sortOrder, prompt: "", followUps: "", answer: "", referenceAnswer: "", reflection: "", tags: [], mastery: "unrated", revision: 0, createdAt: now, updatedAt: now, deletedAt: null };
}
export const sessionTitle = (s: InterviewSession) => s.title.trim() || [s.company.trim(), s.round.trim()].filter(Boolean).join(" · ") || "未命名面经";
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  return text.split(/[,，、;；\n]+/).map(s => s.trim()).filter(s => { const key = s.toLocaleLowerCase(); if (!s || seen.has(key)) return false; seen.add(key); return true; });
}
export function matchesQuery(query: string, ...fields: unknown[]): boolean {
  const haystack = fields.flat().filter(v => v !== null && v !== undefined).join(" ").toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(term => haystack.includes(term));
}
