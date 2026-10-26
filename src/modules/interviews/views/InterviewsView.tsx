import { InterviewFilters } from "../components/InterviewFilters";
import { InterviewList } from "../components/InterviewList";
import { SessionDetail } from "../components/SessionDetail";
import { useInterviews } from "../hooks/useInterviews";
import { sessionTitle, type InterviewQuestion, type InterviewSession } from "../model";

export function InterviewsView() {
  const b = useInterviews();
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <InterviewFilters b={b} />
    {b.recovery.length > 0 && <details className="max-h-48 shrink-0 overflow-y-auto border-b border-amber-400/20 bg-amber-400/5 px-3 py-2 text-ui-11">
      <summary className="cursor-pointer text-amber-300">发现 {b.recovery.length} 份未保存的本机草稿，点击恢复</summary>
      <div className="mt-2 space-y-2">{b.recovery.map(d => <div key={d.key} className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-words">{d.kind === "session" ? sessionTitle(d.value as InterviewSession) : (d.value as InterviewQuestion).prompt || "未命名问题"} · {new Date(d.savedAt).toLocaleString("zh-CN")}</span><button disabled={b.busy} onClick={() => void b.recover(d)} className="shrink-0 text-indigo-300 underline">恢复草稿</button></div>)}</div>
    </details>}
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"><InterviewList b={b} /><SessionDetail b={b} /></div>
  </div>;
}
