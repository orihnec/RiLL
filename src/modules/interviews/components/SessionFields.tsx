import type { ApplicationChoice, InterviewSession } from "../model";
import { FORMATS, REVIEW_STATES } from "../model";
import { Field, SelectControl, TextField } from "./Fields";
import { MarkdownField } from "./MarkdownField";

export function SessionFields({ session: s, applications, onChange }: { session: InterviewSession; applications: ApplicationChoice[]; onChange: (patch: Partial<InterviewSession>) => void }) {
  const linked = applications.find(j => j.id === s.jobId);
  return <div className="space-y-5">
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
      <TextField label="记录标题（可选）" value={s.title} maxLength={300} onChange={e => onChange({ title: e.target.value })} placeholder="例如：前端一面复盘" />
      <Field label="关联投递（可选）"><SelectControl value={s.jobId ?? ""} onChange={e => {
        const job = applications.find(j => j.id === e.target.value);
        onChange(job ? { jobId: job.id, company: job.company, position: job.position } : { jobId: null });
      }}><option value="">独立记录，暂不关联</option>{s.jobId && !linked && <option value={s.jobId}>原投递已移除 · 保留面经快照</option>}{applications.map(j => <option value={j.id} key={j.id}>{j.company} · {j.position}</option>)}</SelectControl></Field>
      <TextField label="公司" value={s.company} maxLength={300} placeholder="可以之后补充" onChange={e => onChange({ company: e.target.value })} />
      <TextField label="岗位" value={s.position} maxLength={500} placeholder="可以之后补充" onChange={e => onChange({ position: e.target.value })} />
      <TextField label="面试轮次" value={s.round} maxLength={100} placeholder="一面 / 二面 / 技术面 / HR 面" onChange={e => onChange({ round: e.target.value })} />
      <TextField label="面试日期（可留空）" type="date" value={s.interviewDate ?? ""} onChange={e => onChange({ interviewDate: e.target.value || null })} />
      <Field label="面试形式"><SelectControl value={s.format} onChange={e => onChange({ format: e.target.value as InterviewSession["format"] })}>{Object.entries(FORMATS).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</SelectControl></Field>
      <Field label="复盘状态"><SelectControl value={s.reviewStatus} onChange={e => onChange({ reviewStatus: e.target.value as InterviewSession["reviewStatus"] })}>{Object.entries(REVIEW_STATES).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</SelectControl></Field>
    </div>
    <p className="text-ui-10 leading-relaxed text-muted-foreground">更换关联投递会带入公司和岗位，之后仍可修改。面试日期留空时保持未知；复盘状态独立于投递进度。</p>
    <MarkdownField label="原始速记" value={s.rawNotes} rows={6} onChange={rawNotes => onChange({ rawNotes })} placeholder="先把记得的内容写下来，支持粘贴长文和 Markdown。下方可逐题整理，原文单独保留。" />
    <MarkdownField label="整体复盘" value={s.summary} onChange={summary => onChange({ summary })} placeholder="这轮发挥、遗漏、沟通节奏、后续准备…" />
  </div>;
}
