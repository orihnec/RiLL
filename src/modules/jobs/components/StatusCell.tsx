import { useState } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { cn } from "../../../lib/utils";
import { jobStatusOf, type JobStatusDef } from "../statusStore";
import type { JobApplication } from "../service";
import { StatusBadge } from "./StatusBadge";

/** 表格内的状态单元格：点开下拉即时切换状态。 */
export function StatusCell({
  job,
  statuses,
  onChange,
}: {
  job: JobApplication;
  statuses: JobStatusDef[];
  onChange: (statusId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const def = jobStatusOf(job.status);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          title="点击切换状态"
          className="rounded-full transition hover:brightness-125"
        >
          <StatusBadge def={def} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-[60] w-40 p-1" onClick={(e) => e.stopPropagation()}>
        {statuses.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setOpen(false);
              if (s.id !== job.status) onChange(s.id);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-white/8",
              s.id === job.status && "bg-white/6",
            )}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: s.bar }} />
            <span className="min-w-0 truncate">{s.name}</span>
            {s.id === job.status && <Check className="ml-auto size-3 shrink-0" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
