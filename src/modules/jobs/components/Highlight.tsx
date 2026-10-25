import type { ReactNode } from "react";

/** 把命中的关键词高亮出来（大小写不敏感，重叠区间会合并）。 */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!text) return null;
  if (terms.length === 0) return <>{text}</>;

  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const t of terms) {
    let i = lower.indexOf(t);
    while (i !== -1) {
      ranges.push([i, i + t.length]);
      i = lower.indexOf(t, i + t.length);
    }
  }
  if (ranges.length === 0) return <>{text}</>;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }

  const out: ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([s, e], idx) => {
    if (s > cursor) out.push(<span key={`t${idx}`}>{text.slice(cursor, s)}</span>);
    out.push(
      <mark key={`m${idx}`} className="rounded bg-amber-300/30 px-0.5 text-amber-100">
        {text.slice(s, e)}
      </mark>,
    );
    cursor = e;
  });
  if (cursor < text.length) out.push(<span key="tail">{text.slice(cursor)}</span>);
  return <>{out}</>;
}
