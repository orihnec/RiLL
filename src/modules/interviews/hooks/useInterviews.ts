import { useEffect, useMemo, useState } from "react";
import { useJobsVersion } from "../../jobs/service";
import { useInterviewNavigation } from "../navigation";
import { addInterviewQuestion, createInterview, patchQuestion, patchSession, refreshInterviews, useInterviewsStore, recoverInterviewDraft, reloadInterview, saveInterviewNow, selectInterview, setInterviewDeleted } from "../store";
import { saveInterviewMarkdown } from "../service";
import type { RecoveryDraft } from "../journal";
import type { InterviewQuestion } from "../model";
import { matchesQuery, type Mastery, type ReviewState } from "../model";

export function useInterviews() {
  const state = useInterviewsStore();
  const navigation = useInterviewNavigation();
  const jobsVersion = useJobsVersion(s => s.version);
  const [mode, setMode] = useState<"sessions" | "questions">("sessions");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [tag, setTag] = useState("");
  const [mastery, setMastery] = useState<"" | Mastery>("");
  const [review, setReview] = useState<"" | ReviewState>("");
  const [trash, setTrash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setMessage(null); useInterviewsStore.setState({ error: null });
    try { await action(); }
    catch (error) { useInterviewsStore.setState({ error: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    void refreshInterviews();
    const focus = () => { void refreshInterviews(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [jobsVersion]);
  useEffect(() => {
    const filter = navigation.jobFilter;
    const current = useInterviewsStore.getState();
    if (filter && current.sessions.find(s => s.id === current.selectedId)?.jobId !== filter.id)
      useInterviewsStore.setState({ selectedId: null, focusQuestionId: null });
  }, [navigation.jobFilter]);
  useEffect(() => {
    const request = navigation.request;
    if (!request) return;
    useInterviewNavigation.setState({ request: null });
    setQuery(""); setCompany(""); setTag(""); setMastery(""); setReview(""); setTrash(false); setMode("sessions");
    void run(() => createInterview(request.job, request.id));
  }, [navigation.request]);
  const questions = state.questions.filter(q => q.deletedAt === null);
  const sessionMap = useMemo(() => new Map(state.sessions.map(s => [s.id, s])), [state.sessions]);
  const questionMatches = (q: typeof questions[number]) => (!tag || q.tags.includes(tag)) && (!mastery || q.mastery === mastery);
  const sessions = state.sessions.filter(s => (s.deletedAt !== null) === trash && (!navigation.jobFilter || s.jobId === navigation.jobFilter.id) && (!company || s.company === company) && (!review || s.reviewStatus === review));
  const visibleSessions = sessions.filter(s => {
    const qs = questions.filter(q => q.sessionId === s.id && questionMatches(q));
    return (!(tag || mastery) || qs.length > 0) && matchesQuery(query, s.title, s.company, s.position, s.round, s.rawNotes, s.summary,
      ...qs.flatMap(q => [q.prompt, q.followUps, q.answer, q.referenceAnswer, q.reflection, ...q.tags]));
  }).sort((a, b) => b.updatedAt - a.updatedAt);
  const allowedSessions = new Set(sessions.map(s => s.id));
  const visibleQuestions = questions.filter(q => allowedSessions.has(q.sessionId) && questionMatches(q) && matchesQuery(query,
    sessionMap.get(q.sessionId)?.company, sessionMap.get(q.sessionId)?.position, sessionMap.get(q.sessionId)?.round,
    q.prompt, q.followUps, q.answer, q.referenceAnswer, q.reflection, q.tags));
  const selected = state.sessions.find(s => s.id === state.selectedId) ?? null;
  const selectedQuestions = state.questions.filter(q => q.sessionId === selected?.id).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return { ...state, selected, selectedQuestions, sessionMap, visibleSessions, visibleQuestions, questions,
    select: selectInterview, patchSession, patchQuestion,
    mode, setMode, query, setQuery, company, setCompany, tag, setTag, mastery, setMastery, review, setReview, trash, busy, message, run,
    setTrash: (value: boolean) => { setTrash(value); useInterviewsStore.setState({ selectedId: null, focusQuestionId: null }); },
    companies: [...new Set(state.sessions.filter(s => !s.deletedAt).map(s => s.company).filter(Boolean))].sort(),
    tags: [...new Set(questions.flatMap(q => q.tags))].sort(), jobFilter: navigation.jobFilter,
    clearJobFilter: () => useInterviewNavigation.setState({ jobFilter: null }),
    create: () => run(async () => { setTrash(false); await createInterview(navigation.jobFilter ?? undefined); }),
    addQuestion: () => selected && run(() => addInterviewQuestion(selected.id)),
    refresh: () => run(refreshInterviews), clearError: () => useInterviewsStore.setState({ error: null }),
    save: () => selected && run(() => saveInterviewNow(selected.id)),
    reload: () => selected && run(() => reloadInterview(selected.id)),
    removeQuestion: (q: InterviewQuestion, deleted: boolean) => run(() => setInterviewDeleted("question", q, deleted)),
    setDeleted: (deleted: boolean) => selected && run(async () => { await setInterviewDeleted("session", selected, deleted); setTrash(deleted); selectInterview(selected.id); }),
    recover: (draft: RecoveryDraft) => run(async () => { setTrash(false); useInterviewNavigation.setState({ jobFilter: null }); await recoverInterviewDraft(draft); }),
    export: () => selected && run(async () => { const path = await saveInterviewMarkdown(selected, selectedQuestions); if (path) setMessage(`已导出当前内容：${path}`); }),
  };
}
export type InterviewsWorkspace = ReturnType<typeof useInterviews>;
