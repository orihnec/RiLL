import { useId, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { Textarea } from "../../../components/ui/textarea";
import { Markdown } from "../../../components/markdown";

export function MarkdownField({ label, value, onChange, placeholder, rows = 4 }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number;
}) {
  const id = useId();
  const [preview, setPreview] = useState(false);
  return <div className="min-w-0 space-y-1.5">
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-ui-11 font-medium">{label}</label>
      <button type="button" onClick={() => setPreview(!preview)} aria-pressed={preview} aria-label={`${label} · ${preview ? "编辑" : "预览"}`} className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-ui-10 text-muted-foreground hover:bg-white/6">
        {preview ? <Pencil className="size-3" /> : <Eye className="size-3" />}{preview ? "编辑" : "预览"}
      </button>
    </div>
    {preview ? <div className="min-h-20 overflow-x-auto break-words rounded-lg border border-white/8 bg-white/2 p-3 text-ui-12"><Markdown text={value || "（尚未填写）"} /></div>
      : <Textarea id={id} value={value} onChange={e => onChange(e.target.value)} rows={rows} maxLength={200_000} placeholder={placeholder} className="max-h-[28rem] min-h-24 resize-y text-ui-12 leading-relaxed md:text-ui-12" />}
  </div>;
}
