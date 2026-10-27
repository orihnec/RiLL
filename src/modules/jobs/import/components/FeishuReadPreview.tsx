import { useState } from "react";
import { Button } from "../../../../components/ui/button";
import type { SourceSnapshot } from "../types";

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map(cellText).join(" · ");
  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    if (typeof item.link === "string") return `${item.text || "链接"} (${item.link})`;
    if (typeof item.text === "string") return item.text;
    if (typeof item.name === "string") return item.name;
    return JSON.stringify(value);
  }
  return String(value);
}

export function FeishuReadPreview({ snapshot, busy, onSave }: { snapshot: SourceSnapshot; busy: boolean; onSave: () => void }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(snapshot.rows.length / 20));
  const current = Math.min(page, pageCount - 1);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">已完整读取 {snapshot.rows.length} 行 · {snapshot.fields.length} 个字段</p>
        <Button size="sm" variant="outline" onClick={onSave} disabled={busy}>保存验证报告和前 5 行样例</Button>
      </div>
      {snapshot.warnings.map((warning) => <p key={warning} className="text-xs text-amber-500">{warning}</p>)}
      <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-background"><tr><th className="px-3 py-2">源行</th>{snapshot.fields.map((field) => <th key={field.key} className="min-w-32 whitespace-nowrap px-3 py-2">{field.name}<span className="ml-1 font-normal text-muted-foreground">({field.type})</span></th>)}</tr></thead>
          <tbody>{snapshot.rows.slice(current * 20, current * 20 + 20).map((row) => <tr key={row.key} className="border-t border-white/5">
            <td className="max-w-36 truncate px-3 py-2" title={row.key}>{row.key}</td>
            {snapshot.fields.map((field) => <td key={field.key} className="max-w-72 break-words px-3 py-2"><span className="line-clamp-3" title={cellText(row.cells[field.key])}>{cellText(row.cells[field.key])}</span></td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-3 text-xs">
        <Button variant="ghost" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>上一页</Button>
        <span>{current + 1} / {pageCount}</span>
        <Button variant="ghost" size="sm" disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)}>下一页</Button>
      </div>
    </section>
  );
}
