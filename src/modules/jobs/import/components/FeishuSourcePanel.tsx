import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import type { SourceResolution } from "../types";

interface Props {
  input: string;
  busy: boolean;
  connected: boolean;
  resolution: SourceResolution | null;
  entireTable: boolean;
  onInput: (value: string) => void;
  onInspect: (selectedId?: string) => void;
  onEntireTable: (value: boolean) => void;
  onRead: () => void;
}

const LABELS = { sheets: "普通工作表", base: "独立多维表格", "embedded-base": "工作表中的内嵌多维表格" };

export function FeishuSourcePanel(props: Props) {
  const { busy, connected, resolution } = props;
  const source = resolution?.source;
  return (
    <section className="space-y-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); props.onInspect(); }}>
        <Input aria-label="飞书表格链接" placeholder="粘贴飞书电子表格或多维表格链接" value={props.input} onChange={(e) => props.onInput(e.target.value)} disabled={busy} />
        <Button variant="outline" size="sm" className="h-9" type="submit" disabled={busy || !connected || !props.input.trim()}>检查链接</Button>
      </form>
      {resolution && <label className="flex flex-wrap items-center gap-2 text-sm">工作表 / 数据表
        <select aria-label="选择工作表或数据表" value={resolution.selectedId || ""}
          disabled={busy} className="min-w-48 rounded-lg border border-white/10 bg-background px-2 py-1.5 text-sm"
          onChange={(e) => { if (e.target.value) props.onInspect(e.target.value); }}>
          <option value="">请选择</option>
          {resolution.choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.title}{choice.hidden ? "（隐藏）" : ""}</option>)}
        </select>
      </label>}
      {source && <div className="space-y-2 rounded-xl bg-white/5 p-3 text-sm">
        <p className="font-medium">{source.title} · {source.containerTitle}</p>
        <p className="text-xs text-muted-foreground">已解析类型：{LABELS[source.kind]}</p>
        {source.viewId ? <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={props.entireTable} disabled={busy} onChange={(e) => props.onEntireTable(e.target.checked)} />
          改为读取整张数据表（不使用链接中的视图过滤）
        </label> : <p className="text-xs text-muted-foreground">读取范围：当前工作表 / 数据表全部可访问记录</p>}
        {source.viewId && !props.entireTable && <p className="text-xs text-muted-foreground">读取范围：链接指定视图 {source.viewId} 的可见字段与记录</p>}
        <Button size="sm" disabled={busy} onClick={props.onRead}>读取字段与记录</Button>
      </div>}
    </section>
  );
}
