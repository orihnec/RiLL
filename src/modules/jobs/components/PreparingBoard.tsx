import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { openExternalLink } from "../../../lib/url";
import { cn } from "../../../lib/utils";
import { useTwoStepConfirm } from "../../../lib/useTwoStepConfirm";
import { deleteJob, listJobs, updateJob, type JobApplication } from "../service";

/**
 * 准备投递：想投但还没投的岗位（`job_applications` 里 status = "preparing"）。
 *
 * 单行高密度，与「已投递」「信息库」同一套行样式。
 */
export function PreparingBoard() {
  const [rows, setRows] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const del = useTwoStepConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await listJobs()).filter((j) => j.status === "preparing"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markApplied = async (id: string) => {
    setBusyId(id);
    try {
      await updateJob(id, { status: "applied" });
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!del.armed(id)) return;
    await deleteJob(id);
    await refresh();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-2.5 text-[10px] text-muted-foreground/55">
        <span className="tabular-nums">共 {rows.length} 个待投</span>
        <span className="hidden text-muted-foreground/35 lg:inline">
          信息库点书签加入这里 · 投出去后点「已投递」进看板
        </span>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          title="刷新"
          className="ml-auto flex size-7 items-center justify-center rounded-lg text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!loading && rows.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground/50">
            <Plus className="size-5 opacity-50" />
            还没有待投岗位：去「信息库」挑一个，或在聊天里说「把 XX 岗位加进待投」
          </div>
        )}

        {rows.map((j) => (
          <div
            key={j.id}
            title={j.notes ?? j.position}
            className="group flex h-9 items-center gap-2 border-b border-white/4 px-3 transition hover:bg-white/5"
          >
            <span className="w-[30%] shrink-0 truncate text-[12.5px] font-medium">{j.company}</span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground/70">{j.position}</span>
            <span className="hidden min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground/40 xl:block">
              {j.notes ?? ""}
            </span>
            <div className="flex w-[64px] shrink-0 items-center justify-end gap-0.5">
              {j.url && (
                <button
                  onClick={() => void openExternalLink(j.url as string)}
                  title={j.url}
                  className="rounded-md p-1 text-muted-foreground/50 transition hover:bg-white/10 hover:text-indigo-300"
                >
                  <ExternalLink className="size-3.5" />
                </button>
              )}
              <button
                onClick={() => void markApplied(j.id)}
                disabled={busyId === j.id}
                title="已经投出去了：移到「已投递」看板"
                className="rounded-md p-1 text-emerald-300/70 transition hover:bg-white/10 hover:text-emerald-300 disabled:opacity-50"
              >
                {busyId === j.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="size-3.5" />
                )}
              </button>
              <button
                onClick={() => void remove(j.id)}
                title="删除"
                className={cn(
                  "rounded-md p-1 transition",
                  del.pendingKey === j.id
                    ? "bg-red-500/20 px-1 text-red-300"
                    : "text-muted-foreground/35 opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-red-300",
                )}
              >
                {del.pendingKey === j.id ? (
                  <span className="text-[10px]">确认？</span>
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
