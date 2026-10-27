import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { PAGE_SIZES } from "../format";

/** 分页条：首页/上下页/末页 + 跳页输入 + 每页条数。 */
export function Pager({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const [jump, setJump] = useState(String(page));
  useEffect(() => setJump(String(page)), [page]);

  const goto = (p: number) => onPage(Math.min(Math.max(1, p), pageCount));
  const commitJump = () => {
    const n = Number(jump.replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n >= 1) goto(n);
    else setJump(String(page));
  };

  const btn =
    "flex size-6 items-center justify-center rounded-md border border-white/8 bg-white/3 text-muted-foreground transition hover:bg-white/8 hover:text-foreground disabled:opacity-30 disabled:hover:bg-white/3";

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/6 px-4 py-2 text-ui-11 text-muted-foreground/70">
      <span>
        共 <span className="tabular-nums text-foreground/80">{total}</span> 条 · 第{" "}
        <span className="tabular-nums text-foreground/80">{page}</span> / {pageCount} 页
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="h-6 rounded-md border border-white/8 bg-white/3 px-1 text-ui-10 text-muted-foreground outline-none hover:text-foreground"
          title="每页条数"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n} className="bg-popover">
              每页 {n}
            </option>
          ))}
        </select>
        <button className={btn} onClick={() => goto(1)} disabled={page <= 1} title="第一页">
          <ChevronsLeft className="size-3.5" />
        </button>
        <button className={btn} onClick={() => goto(page - 1)} disabled={page <= 1} title="上一页">
          <ChevronLeft className="size-3.5" />
        </button>
        <span className="flex items-center gap-1">
          第
          <input
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onBlur={commitJump}
            onKeyDown={(e) => e.key === "Enter" && commitJump()}
            className="h-6 w-12 rounded-md border border-white/10 bg-white/4 px-1 text-center text-ui-10 tabular-nums text-foreground outline-none focus:border-indigo-400/50"
          />
          页
        </span>
        <button className={btn} onClick={() => goto(page + 1)} disabled={page >= pageCount} title="下一页">
          <ChevronRight className="size-3.5" />
        </button>
        <button className={btn} onClick={() => goto(pageCount)} disabled={page >= pageCount} title="最后一页">
          <ChevronsRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
