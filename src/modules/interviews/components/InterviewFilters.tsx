import { BookOpen, List, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { MASTERY, REVIEW_STATES, type Mastery, type ReviewState } from "../model";
import type { InterviewsWorkspace } from "../hooks/useInterviews";
import { SelectControl } from "./Fields";

export function InterviewFilters({ b }: { b: InterviewsWorkspace }) {
  return <div className="shrink-0 space-y-2 border-b border-white/6 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-lg bg-white/4 p-1" aria-label="面经查看方式">
        <button onClick={() => b.setMode("sessions")} aria-pressed={b.mode === "sessions"} className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-11 ${b.mode === "sessions" ? "bg-white/10" : "text-muted-foreground"}`}><BookOpen className="size-3.5" />按面试</button>
        <button onClick={() => b.setMode("questions")} aria-pressed={b.mode === "questions"} className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-11 ${b.mode === "questions" ? "bg-white/10" : "text-muted-foreground"}`}><List className="size-3.5" />按问题</button>
      </div>
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="搜索面经" value={b.query} onChange={e => b.setQuery(e.target.value)} placeholder="搜索公司、题目、回答或知识点" className="h-auto min-h-9 py-2 pl-8 text-ui-11 md:text-ui-11" />
      </div>
      <Button size="sm" onClick={() => void b.create()} disabled={b.busy}><Plus className="size-3.5" />新建面经</Button>
      <button onClick={() => b.setTrash(!b.trash)} aria-pressed={b.trash} title="面经回收站" className="flex shrink-0 items-center gap-1 rounded-md px-2 py-2 text-ui-11 text-muted-foreground hover:bg-white/6"><Trash2 className="size-3.5" />{b.trash ? "返回记录" : "回收站"}</button>
      <button onClick={() => void b.refresh()} title="刷新面经" disabled={b.loading || b.busy} className="rounded-md p-2 text-muted-foreground hover:bg-white/6"><RefreshCw className={`size-3.5 ${b.loading ? "animate-spin" : ""}`} /></button>
    </div>
    <div className="flex flex-wrap gap-2">
      <div className="min-w-[8rem] flex-1"><SelectControl aria-label="公司筛选" value={b.company} onChange={e => b.setCompany(e.target.value)}><option value="">全部公司</option>{b.companies.map(c => <option key={c} value={c}>{c}</option>)}</SelectControl></div>
      <div className="min-w-[8rem] flex-1"><SelectControl aria-label="复盘状态筛选" value={b.review} onChange={e => b.setReview(e.target.value as "" | ReviewState)}><option value="">全部复盘状态</option>{Object.entries(REVIEW_STATES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</SelectControl></div>
      <div className="min-w-[8rem] flex-1"><SelectControl aria-label="掌握程度筛选" value={b.mastery} onChange={e => b.setMastery(e.target.value as "" | Mastery)}><option value="">全部掌握程度</option>{Object.entries(MASTERY).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</SelectControl></div>
      <div className="min-w-[8rem] flex-1"><SelectControl aria-label="标签筛选" value={b.tag} onChange={e => b.setTag(e.target.value)}><option value="">全部标签</option>{b.tags.map(t => <option key={t} value={t}>{t}</option>)}</SelectControl></div>
      {(b.query || b.company || b.review || b.mastery || b.tag) && <button onClick={() => { b.setQuery(""); b.setCompany(""); b.setReview(""); b.setMastery(""); b.setTag(""); }} className="flex shrink-0 items-center gap-1 px-2 py-1 text-ui-10 text-muted-foreground"><X className="size-3" />清除筛选</button>}
    </div>
    {b.jobFilter && <div className="flex flex-wrap items-center gap-2 text-ui-11 text-indigo-300"><span>关联投递：{b.jobFilter.company} · {b.jobFilter.position}</span><button onClick={b.clearJobFilter} className="underline underline-offset-2">查看全部面经</button></div>}
    {b.error && <p role="alert" className="break-words text-ui-11 text-red-400">{b.error}<button onClick={b.clearError} className="ml-2 underline">收起</button></p>}
    {b.message && <p role="status" className="break-all text-ui-11 text-emerald-400">{b.message}</p>}
  </div>;
}
