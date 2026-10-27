import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Wrench } from "lucide-react";
import type { ToolCallView } from "../../../kernel/agent/types";
import { cn } from "../../../lib/utils";
import { fmtArgValue } from "../format";

/** 工具调用单行（DSH 风格）：紧凑一行，点击展开 IN/OUT。 */
export function ToolRow({ tc }: { tc: ToolCallView }) {
  const [open, setOpen] = useState(false);
  const hasArgs = tc.args && Object.keys(tc.args).length > 0;
  const expandable = hasArgs || !!tc.result;
  const summary = Object.values(tc.args ?? {}).map(fmtArgValue).filter(Boolean).join(" · ");
  // 错误时折叠行直接显示失败首行（错误色）
  const failureLine = tc.status === "error" ? (tc.result ?? "执行失败").split("\n")[0] : null;

  return (
    <div className="w-full">
      <button
        onClick={() => expandable && setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-1 rounded-md px-1 py-[3px] text-left text-ui-10-5 transition",
          expandable ? "hover:bg-white/5" : "cursor-default",
        )}
      >
        {tc.status === "running" ? (
          <Loader2 className="size-2.5 shrink-0 animate-spin text-indigo-300" />
        ) : tc.status === "done" ? (
          <CheckCircle2 className="size-2.5 shrink-0 text-emerald-400/80" />
        ) : (
          <AlertCircle className="size-2.5 shrink-0 text-red-400" />
        )}
        <Wrench className="size-2.5 shrink-0 text-muted-foreground/40" />
        <span className="shrink-0 font-mono text-ui-10 text-indigo-200/90">{tc.name}</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            failureLine ? "text-red-400/90" : "text-muted-foreground/55",
          )}
        >
          {failureLine ?? (tc.status === "running" ? summary || "执行中…" : summary)}
        </span>
        <span className="shrink-0 tabular-nums text-ui-9 text-muted-foreground/40">
          {tc.status === "running" ? "执行中" : tc.status === "done" ? "完成" : "失败"}
        </span>
        {expandable && (
          <ChevronDown
            className={cn("size-2.5 shrink-0 text-muted-foreground/40 transition", open && "rotate-180")}
          />
        )}
      </button>
      {open && expandable && (
        <div className="mb-1 ml-4 max-h-44 overflow-y-auto rounded-lg border border-white/8 bg-black/20">
          {hasArgs && (
            <div className="px-2 py-1">
              <span className="mr-1.5 rounded bg-white/8 px-1 py-px font-mono text-ui-9 text-muted-foreground/70">
                IN
              </span>
              <pre className="mt-0.5 whitespace-pre-wrap font-mono text-ui-10 leading-relaxed text-muted-foreground/80">
                {JSON.stringify(tc.args, null, 1)}
              </pre>
            </div>
          )}
          {hasArgs && tc.result && <div className="mx-2 h-px bg-white/6" aria-hidden />}
          {tc.result && (
            <div className="px-2 py-1">
              <span className="mr-1.5 rounded bg-white/8 px-1 py-px font-mono text-ui-9 text-muted-foreground/70">
                OUT
              </span>
              <pre className="mt-0.5 whitespace-pre-wrap font-mono text-ui-10 leading-relaxed text-muted-foreground/80">
                {tc.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
