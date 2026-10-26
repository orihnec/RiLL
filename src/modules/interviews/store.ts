import { create } from "zustand";
import { isTauri } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { Autosave, type SaveStatus } from "./autosave";
import { createDraftJournal, type RecoveryDraft } from "./journal";
import { interviewsRepository, listApplicationChoices } from "./service";
import { newSession, sameContent, type ApplicationChoice, type InterviewQuestion, type InterviewSession, type InterviewRecord, type RecordKind } from "./model";

const owner = crypto.randomUUID();
const journal = typeof localStorage === "undefined" ? null : createDraftJournal(localStorage, owner);
const managers = new Map<string, Autosave<InterviewRecord>>();
const keyOf = (kind: RecordKind, id: string) => `${kind}:${id}`;
function notifyChanged() { if (isTauri()) void emit("interviews:changed", owner).catch(() => undefined); }
interface State {
  sessions: InterviewSession[]; questions: InterviewQuestion[]; applications: ApplicationChoice[];
  selectedId: string | null; focusQuestionId: string | null; selectionVersion: number; loading: boolean; error: string | null;
  saves: Record<string, SaveStatus>; recovery: RecoveryDraft[];
}
export const useInterviewsStore = create<State>(() => ({ sessions: [], questions: [], applications: [], selectedId: null, focusQuestionId: null, selectionVersion: 0, loading: false, error: null, saves: {}, recovery: [] }));
function publish(kind: RecordKind, value: InterviewRecord, status?: SaveStatus) {
  useInterviewsStore.setState(state => {
    const field = kind === "session" ? "sessions" : "questions";
    const records = state[field] as InterviewRecord[];
    return { [field]: records.some(v => v.id === value.id) ? records.map(v => v.id === value.id ? value : v) : [...records, value],
      ...(status ? { saves: { ...state.saves, [keyOf(kind, value.id)]: status } } : {}) };
  });
}
function manager(kind: RecordKind, id: string) {
  const key = keyOf(kind, id), existing = managers.get(key);
  if (existing) return existing;
  const state = useInterviewsStore.getState();
  const value = (kind === "session" ? state.sessions : state.questions).find(v => v.id === id);
  if (!value) throw new Error("面经记录不存在，请刷新");
  const result = new Autosave<InterviewRecord>(value, { save: async draft => {
    const saved = await interviewsRepository().save(kind, draft);
    notifyChanged();
    return saved;
  }, journal: draft => journal?.write(kind, id, draft), changed: (draft, status) => publish(kind, draft, status) });
  managers.set(key, result); return result;
}
let readVersion = 0;
function invalidateRead() { readVersion++; useInterviewsStore.setState({ loading: false }); }
export async function refreshInterviews() {
  const version = ++readVersion;
  useInterviewsStore.setState({ loading: true, error: null });
  try {
    const [data, applications] = await Promise.all([interviewsRepository().list(), listApplicationChoices()]);
    if (version !== readVersion) return;
    for (const s of data.sessions) managers.get(keyOf("session", s.id))?.accept(s);
    for (const q of data.questions) managers.get(keyOf("question", q.id))?.accept(q);
    const recovery = (journal?.read() ?? []).filter(d => {
      if (d.key === journal?.key(d.kind, d.value.id)) return false;
      const record = (d.kind === "session" ? data.sessions : data.questions).find(v => v.id === d.value.id);
      return !record || record.deletedAt !== null || !sameContent(d.kind, record, d.value);
    });
    useInterviewsStore.setState({ applications, recovery, loading: false,
      sessions: data.sessions.map(s => managers.get(keyOf("session", s.id))?.value as InterviewSession ?? s),
      questions: data.questions.map(q => managers.get(keyOf("question", q.id))?.value as InterviewQuestion ?? q) });
  } catch (error) { if (version === readVersion) useInterviewsStore.setState({ loading: false, error: String(error instanceof Error ? error.message : error) }); }
}
export async function createInterview(job?: ApplicationChoice, id: string = crypto.randomUUID()) {
  const value = await interviewsRepository().createSession(newSession(id, job));
  invalidateRead();
  publish("session", value); selectInterview(value.id); notifyChanged(); await refreshInterviews(); return value;
}
export function selectInterview(id: string, questionId: string | null = null) {
  useInterviewsStore.setState(state => ({ selectedId: id, focusQuestionId: questionId, selectionVersion: state.selectionVersion + 1 }));
}
export function patchSession(id: string, patch: Partial<InterviewSession>) { manager("session", id).patch(patch); }
export function patchQuestion(id: string, patch: Partial<InterviewQuestion>) { manager("question", id).patch(patch); }
export async function addInterviewQuestion(sessionId: string) {
  await managers.get(keyOf("session", sessionId))?.flush();
  const q = await interviewsRepository().createQuestion(crypto.randomUUID(), sessionId);
  invalidateRead();
  publish("question", q); selectInterview(sessionId, q.id); notifyChanged(); await refreshInterviews(); return q;
}
export async function saveInterviewNow(sessionId: string) {
  const state = useInterviewsStore.getState();
  const keys = [keyOf("session", sessionId), ...state.questions.filter(q => q.sessionId === sessionId).map(q => keyOf("question", q.id))];
  // 顺序等待，使错误可见；每条记录都是带 revision 的单条原子更新。
  for (const key of keys) await managers.get(key)?.flush();
}
export async function setInterviewDeleted(kind: RecordKind, value: InterviewRecord, deleted: boolean) {
  if (deleted) {
    if (kind === "session") await saveInterviewNow(value.id);
    else await managers.get(keyOf(kind, value.id))?.flush();
  }
  const current = (kind === "session" ? useInterviewsStore.getState().sessions : useInterviewsStore.getState().questions).find(v => v.id === value.id)!;
  const saved = await interviewsRepository().setDeleted(kind, current, deleted);
  invalidateRead();
  managers.get(keyOf(kind, value.id))?.accept(saved); publish(kind, saved);
  notifyChanged(); await refreshInterviews();
}
export async function reloadInterview(sessionId: string) {
  const state = useInterviewsStore.getState();
  const values: [RecordKind, string][] = [["session", sessionId], ...state.questions.filter(q => q.sessionId === sessionId).map(q => ["question", q.id] as [RecordKind, string])];
  for (const [kind, id] of values) {
    const saved = await interviewsRepository().read(kind, id);
    if (!saved) throw new Error("数据库中的记录已不存在，请先导出本机草稿");
    managers.get(keyOf(kind, id))?.discard(saved); publish(kind, saved);
  }
  await refreshInterviews();
}
export async function recoverInterviewDraft(draft: RecoveryDraft) {
  const repo = interviewsRepository(), current = await repo.read(draft.kind, draft.value.id);
  if (!current) throw new Error("原记录不存在，请先保留本机草稿并检查数据库");
  const sessionId = draft.kind === "session" ? draft.value.id : (draft.value as InterviewQuestion).sessionId;
  const session = await repo.read("session", sessionId);
  if (!session || session.deletedAt !== null || current.deletedAt !== null) throw new Error("请先在回收站恢复这份面经或问题，再恢复草稿");
  const existing = managers.get(keyOf(draft.kind, current.id));
  if (existing?.status.dirty) throw new Error("当前记录仍有未保存修改，请先保存或导出");
  selectInterview(sessionId, draft.kind === "question" ? draft.value.id : null);
  manager(draft.kind, current.id).recover(draft.value);
  await manager(draft.kind, current.id).flush();
  // 只在恢复成功后移除来源草稿；失败时两份副本都保留。
  journal?.remove(draft.key); await refreshInterviews();
}
if (isTauri()) void listen<string>("interviews:changed", event => { if (event.payload !== owner) void refreshInterviews(); });
