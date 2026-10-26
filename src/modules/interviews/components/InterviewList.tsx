import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { cn } from "../../../lib/utils";
import { MASTERY, REVIEW_STATES, sessionTitle } from "../model";
import type { InterviewsWorkspace } from "../hooks/useInterviews";

export function InterviewList({ b }: { b: InterviewsWorkspace }) {
  const [limit, setLimit] = useState(60);
  useEffect(() => setLimit(60), [b.mode, b.query, b.company, b.tag, b.mastery, b.review, b.trash]);
  const total = b.mode === "sessions" ? b.visibleSessions.length : b.visibleQuestions.length;
  return <aside aria-label="面经列表" className="flex max-h-56 min-h-0 shrink-0 flex-col border-b border-white/6 lg:max-h-none lg:w-[min(32%,22rem)] lg:border-b-0 lg:border-r">
    <div className="shrink-0 px-3 py-2 text-ui-10 text-muted-foreground">{b.trash ? "回收站 · " : ""}{total} {b.mode === "sessions" ? "场面试" : "道问题"}</div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {!total && <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-ui-11 text-muted-foreground"><BookOpen className="size-5 opacity-50" />{b.loading ? "正在读取面经…" : b.trash ? "回收站是空的" : "暂无匹配记录，可以新建面经或调整筛选"}</div>}
      {b.mode === "sessions" ? b.visibleSessions.slice(0, limit).map(s => {
        const qs = b.questions.filter(q => q.sessionId === s.id);
        return <button key={s.id} onClick={() => b.select(s.id)} className={cn("mb-1 w-full rounded-lg border p-3 text-left transition", s.id === b.selectedId ? "border-indigo-400/40 bg-indigo-400/10" : "border-transparent hover:bg-white/5")}>
          <div className="break-words text-ui-12 font-medium">{sessionTitle(s)}</div>
          <p className="mt-1 truncate text-ui-10 text-muted-foreground">{s.position || "岗位待补充"}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-ui-10 text-muted-foreground"><span>{s.interviewDate ?? "面试日期待补"}</span><span>{REVIEW_STATES[s.reviewStatus]}</span><span>{qs.length} 题 · {qs.filter(q => q.mastery === "needs_work").length} 题需加强</span></div>
        </button>;
      }) : b.visibleQuestions.slice(0, limit).map(q => {
        const s = b.sessionMap.get(q.sessionId)!;
        return <button key={q.id} onClick={() => b.select(s.id, q.id)} className={cn("mb-1 w-full rounded-lg border p-3 text-left transition", q.id === b.focusQuestionId ? "border-indigo-400/40 bg-indigo-400/10" : "border-transparent hover:bg-white/5")}>
          <div className="line-clamp-2 break-words text-ui-12">{q.prompt || "待补充题目"}</div>
          <p className="mt-1 truncate text-ui-10 text-muted-foreground">{s.company || "公司待补充"} · {s.round || "轮次待补"}</p>
          <div className="mt-2 flex flex-wrap gap-1 text-ui-10"><span className="rounded bg-indigo-400/10 px-1.5 py-0.5 text-indigo-300">{MASTERY[q.mastery]}</span>{q.tags.slice(0, 3).map(t => <span key={t} className="rounded bg-white/5 px-1.5 py-0.5 text-muted-foreground">{t}</span>)}</div>
        </button>;
      })}
      {total > limit && <button onClick={() => setLimit(n => n + 60)} className="w-full px-3 py-2 text-ui-11 text-indigo-300">显示更多（{limit}/{total}）</button>}
    </div>
  </aside>;
}
