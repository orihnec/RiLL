import type { PointerEvent as ReactPointerEvent } from "react";
import { format } from "date-fns";
import type { Occurrence } from "../service";
import { categoryOf } from "../../../lib/colors";
import { cn } from "../../../lib/utils";

interface Props {
  occ: Occurrence;
  draft?: boolean;
  onClick: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onResizeStart: (e: ReactPointerEvent) => void;
}

/** 周视图中的单个事件卡片：低饱和渐变 + 左侧色条。 */
export function EventCard({ occ, draft, onClick, onPointerDown, onResizeStart }: Props) {
  const cat = categoryOf(occ.category);
  const compact = occ.endAt - occ.startAt < 45 * 60_000;

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${occ.title}\n${format(new Date(occ.startAt), "HH:mm")} – ${format(new Date(occ.endAt), "HH:mm")}`}
      className={cn(
        "group relative h-full cursor-grab select-none overflow-hidden rounded-lg border border-white/10 shadow-sm transition-shadow hover:shadow-lg active:cursor-grabbing",
        draft && "opacity-80 ring-2 ring-indigo-400/70",
      )}
      style={{ background: `linear-gradient(135deg, ${cat.from}, ${cat.to})` }}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: cat.bar }} />
      <div className="flex h-full flex-col justify-start gap-0.5 px-2 py-1 pl-2.5">
        <div
          className={cn("truncate font-medium leading-tight", compact ? "text-[10px]" : "text-xs")}
          style={{ color: cat.text }}
        >
          {occ.title}
        </div>
        {!compact && (
          <div className="text-[10px] tabular-nums text-foreground/60">
            {format(new Date(occ.startAt), "HH:mm")}–{format(new Date(occ.endAt), "HH:mm")}
          </div>
        )}
      </div>
      {/* resize 手柄 */}
      <div
        onPointerDown={onResizeStart}
        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "rgba(255,255,255,0.35)" }}
      />
    </div>
  );
}
