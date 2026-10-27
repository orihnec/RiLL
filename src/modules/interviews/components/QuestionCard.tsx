import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { MASTERY, parseTags, type InterviewQuestion } from "../model";
import { Input } from "../../../components/ui/input";
import { Field, SelectControl } from "./Fields";
import { MarkdownField } from "./MarkdownField";

function TagsInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState(tags.join("，"));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (document.activeElement !== ref.current) setText(tags.join("，")); }, [tags]);
  return <Field label="知识点标签"><Input ref={ref} value={text} maxLength={2000} placeholder="React，闭包，项目经历" onChange={e => { setText(e.target.value); onChange(parseTags(e.target.value)); }} className="h-auto min-h-9 py-2 text-ui-12 md:text-ui-12" /><span className="text-ui-10 text-muted-foreground">用逗号分隔，最多 20 个标签，每个 40 字。</span></Field>;
}
export function QuestionCard({ question: q, index, focused, focusVersion, onChange, onRemove, busy }: {
  question: InterviewQuestion; index: number; focused: boolean; focusVersion: number; onChange: (patch: Partial<InterviewQuestion>) => void; onRemove: () => void; busy: boolean;
}) {
  const [expanded, setExpanded] = useState(index === 0 || focused);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (focused) { setExpanded(true); ref.current?.scrollIntoView({ block: "start" }); } }, [focused, focusVersion]);
  return <section ref={ref} aria-label={`问题 ${index + 1}`} className={`min-w-0 rounded-xl border ${focused ? "border-indigo-400/50" : "border-white/10"}`}>
    <div className="flex items-start gap-2 p-3">
      <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-start gap-2 text-left">
        {expanded ? <ChevronDown className="mt-1 size-3.5 shrink-0" /> : <ChevronRight className="mt-1 size-3.5 shrink-0" />}
        <span className="min-w-0 break-words text-ui-12 font-medium">{index + 1}. {q.prompt.trim() || "待补充题目"}</span>
      </button>
      <span className="shrink-0 whitespace-nowrap rounded-md bg-white/5 px-2 py-1 text-ui-10 text-muted-foreground">{MASTERY[q.mastery]}</span>
      <button onClick={onRemove} disabled={busy} title="移除问题（可恢复）" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-red-400/10 hover:text-red-400"><Trash2 className="size-3.5" /></button>
    </div>
    {expanded && <div className="space-y-4 border-t border-white/6 p-3">
      <MarkdownField label="题目原话" value={q.prompt} onChange={prompt => onChange({ prompt })} rows={2} placeholder="面试官具体问了什么？" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
        <TagsInput tags={q.tags} onChange={tags => onChange({ tags })} />
        <Field label="掌握程度"><SelectControl value={q.mastery} onChange={e => onChange({ mastery: e.target.value as InterviewQuestion["mastery"] })}>{Object.entries(MASTERY).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</SelectControl></Field>
      </div>
      <MarkdownField label="追问" value={q.followUps} onChange={followUps => onChange({ followUps })} placeholder="围绕这道题，面试官还追问了什么？" rows={2} />
      <MarkdownField label="当时的回答" value={q.answer} onChange={answer => onChange({ answer })} placeholder="保留当时真实的回答和遗漏。" />
      <MarkdownField label="复盘后的参考答案" value={q.referenceAnswer} onChange={referenceAnswer => onChange({ referenceAnswer })} placeholder="整理更完整的表达、代码或解题过程，支持 Markdown 代码块。" />
      <MarkdownField label="我的复盘" value={q.reflection} onChange={reflection => onChange({ reflection })} placeholder="卡在哪里？需要补哪块知识？下次怎样表达？" />
    </div>}
  </section>;
}
