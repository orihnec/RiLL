import { cn } from "../../../lib/utils";
import type { JobStatusDef } from "../statusStore";

/** 状态徽章：低饱和底色 + 状态色文字/圆点。 */
export function StatusBadge({ def, className }: { def: JobStatusDef; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-ui-10 font-medium whitespace-nowrap",
        className,
      )}
      style={{ background: def.from, color: def.text, borderColor: `${def.bar}55` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: def.bar }} />
      {def.name}
    </span>
  );
}
