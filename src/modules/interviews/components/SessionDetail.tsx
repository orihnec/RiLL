import { BookOpen, Download, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Markdown } from "../../../components/markdown";
import { useTwoStepConfirm } from "../../../lib/useTwoStepConfirm";
import type { InterviewsWorkspace } from "../hooks/useInterviews";
import { sessionTitle } from "../model";
import { exportMarkdown } from "../markdown";
import { QuestionCard } from "./QuestionCard";
import { SessionFields } from "./SessionFields";

export function SessionDetail({ b }: { b: InterviewsWorkspace }) {
  const confirm = useTwoStepConfirm();
  const s = b.selected;
  if (!s) return <div className="flex min-h-48 min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-ui-12 text-muted-foreground"><BookOpen className="size-7 opacity-50" /><p>选择一场面试或一道问题，查看和编辑复盘。</p><p className="text-ui-11">可以先记录原文，再补公司、岗位和日期。内容自动保存在本机。</p><Button onClick={() => void b.create()} disabled={b.busy}><Plus className="size-3.5" />记录一场面试</Button></div>;
  const ids = new Set([`session:${s.id}`, ...b.selectedQuestions.map(q => `question:${q.id}`)]);
  const statuses = Object.entries(b.saves).filter(([key]) => ids.has(key)).map(([, value]) => value);
  const errors = [...new Set(statuses.map(v => v.error).filter(Boolean))];
  const saving = statuses.some(v => v.dirty || v.saving);
  const active = b.selectedQuestions.filter(q => q.deletedAt === null), removed = b.selectedQuestions.filter(q => q.deletedAt !== null);
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <header className="shrink-0 space-y-2 border-b border-white/6 p-3">
      <div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 flex-1 break-words text-sm font-semibold">{sessionTitle(s)}</h2><span role="status" className={`text-ui-10 ${errors.length ? "text-red-400" : "text-muted-foreground"}`}>{s.deletedAt !== null ? "已移入回收站" : errors.length ? "保存失败 · 草稿保留" : saving ? "自动保存中…" : "已保存到本机"}</span></div>
      <div className="flex flex-wrap items-center gap-2">
        {s.deletedAt === null && <Button size="sm" variant="outline" disabled={b.busy} onClick={() => void b.save()}><Save className="size-3.5" />立即保存</Button>}
        <Button size="sm" variant="outline" disabled={b.busy} onClick={() => void b.export()}><Download className="size-3.5" />导出 Markdown</Button>
        <button disabled={b.busy} onClick={() => void b.setDeleted(s.deletedAt === null)} className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-ui-10 text-muted-foreground hover:bg-white/6">{s.deletedAt === null ? <Trash2 className="size-3.5" /> : <RotateCcw className="size-3.5" />}{s.deletedAt === null ? "移入回收站" : "恢复面经"}</button>
      </div>
      {errors.length > 0 && <div role="alert" className="space-y-1 break-words text-ui-11 text-red-400">{errors.map(error => <p key={error}>{error}</p>)}<p className="text-muted-foreground">可先导出当前内容保留修改，再重新载入数据库版本。</p><button disabled={b.busy} onClick={() => { if (confirm.armed("reload")) void b.reload(); }} className="underline underline-offset-2">{confirm.pendingKey === "reload" ? "确认放弃本机修改并重载？" : "重新载入数据库版本"}</button></div>}
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {s.deletedAt !== null ? <div className="break-words text-ui-12"><p className="mb-4 text-muted-foreground">记录和问题均已保留，恢复后可继续编辑。</p><Markdown text={exportMarkdown(s, b.selectedQuestions)} /></div> :
        <fieldset disabled={b.busy} className="min-w-0 space-y-6">
          <SessionFields session={s} applications={b.applications} onChange={patch => b.patchSession(s.id, patch)} />
          <div className="flex flex-wrap items-center gap-2 border-t border-white/8 pt-4"><h3 className="text-ui-12 font-semibold">逐题复盘 · {active.length} 题</h3><span className="text-ui-10 text-muted-foreground">当时回答与参考答案分别保留</span><Button className="ml-auto" size="sm" onClick={() => void b.addQuestion()} disabled={b.busy}><Plus className="size-3.5" />添加问题</Button></div>
          {!active.length && <p className="rounded-lg border border-dashed border-white/10 p-4 text-ui-11 leading-relaxed text-muted-foreground">先在上方保存速记，再点击“添加问题”逐题记录。回答与复盘支持 Markdown、代码块和预览。</p>}
          {active.map((q, i) => <QuestionCard key={q.id} question={q} index={i} focused={q.id === b.focusQuestionId} focusVersion={b.selectionVersion} busy={b.busy} onChange={patch => b.patchQuestion(q.id, patch)} onRemove={() => void b.removeQuestion(q, true)} />)}
          {removed.length > 0 && <details className="rounded-lg border border-white/8 p-3 text-ui-11 text-muted-foreground"><summary className="cursor-pointer">已移除的问题（{removed.length}）</summary><div className="mt-2 space-y-2">{removed.map(q => <div key={q.id} className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-words">{q.prompt || "待补充题目"}</span><button disabled={b.busy} onClick={() => void b.removeQuestion(q, false)} className="shrink-0 text-indigo-300 underline">恢复问题</button></div>)}</div></details>}
        </fieldset>}
    </div>
  </div>;
}
