import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "../../../lib/utils";
import { firstLine, latestLine } from "../format";

/** 思考过程折叠行（运行中跟随最新一行 + 扫光动画，完成后显示首行）。 */
export function ReasoningRow({ text, running }: { text: string; running: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const summary = running ? latestLine(text) : firstLine(text);

  return (
    <div className="w-full" data-state={running ? "running" : "ok"}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "group flex w-full items-center gap-1 rounded-md px-1 py-[3px] text-left transition hover:bg-white/5",
          running && "reasoning-sweep",
        )}
      >
        <Brain className="size-2.5 shrink-0 text-muted-foreground/50" />
        <span className="shrink-0 text-[10.5px] text-foreground/60">思考过程</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground/45",
            running && "text-indigo-300/60",
          )}
        >
          {summary}
        </span>
        <ChevronDown
          className={cn(
            "size-2.5 shrink-0 text-muted-foreground/40 transition group-hover:text-foreground",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div className="ml-3 mt-0.5 max-h-48 overflow-y-auto whitespace-pre-wrap border-l border-white/10 pl-2.5 text-[11px] leading-relaxed text-muted-foreground/55">
          {text}
        </div>
      )}
    </div>
  );
}
