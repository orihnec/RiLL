import { useState } from "react";
import { ArrowRight, BookOpen, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { openExternalLink } from "../../../lib/url";
import { cn } from "../../../lib/utils";
import type { JobApplication } from "../service";
import { usePreparingBoard } from "../hooks/usePreparingBoard";
import { JobFormDialog } from "./JobFormDialog";
import { ContextMenu, type CtxMenuItem } from "../../../components/ui/ContextMenu";
// 待投记录也可以关联独立保存的面经。
import { openInterviews } from "../../interviews";

/**
 * 准备投递：想投但还没投的岗位（`job_applications` 里 status = "preparing"）。
 *
 * 单行高密度，与「已投递」「信息库」同一套行样式。
 */
export function PreparingBoard() {
  const { rows, loading, busyId, error, del, statuses, refresh, markApplied, remove } = usePreparingBoard();
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-2.5 text-ui-10 text-muted-foreground/55">
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
        {error && <p role="alert" className="px-3 py-2 text-xs text-red-400">{error}</p>}
        {!loading && rows.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground/50">
            <Plus className="size-5 opacity-50" />
            还没有待投岗位：去「信息库」挑一个，或在聊天里说「把 XX 岗位加进待投」
          </div>
        )}

        {rows.map((j) => (
          <div
            key={j.id}
            onClick={() => setEditing(j)}
            onContextMenu={event => {
              event.preventDefault(); event.stopPropagation();
              setMenu({ x: event.clientX, y: event.clientY, items: [
                { label: "记录面经", icon: <BookOpen className="size-3.5" />, onSelect: () => openInterviews(j, true) },
                { label: "查看面经", icon: <BookOpen className="size-3.5" />, onSelect: () => openInterviews(j) },
              ] });
            }}
            title={j.notes ?? j.position}
            className="group flex min-h-9 cursor-pointer items-center gap-2 border-b border-white/4 px-3 py-1 transition hover:bg-white/5"
          >
            <span className="w-[30%] shrink-0 truncate text-ui-12-5 font-medium">{j.company}</span>
            <span className="min-w-0 flex-1 truncate text-ui-11-5 text-foreground/70">{j.position}</span>
            <span className="hidden min-w-0 flex-1 truncate text-ui-10-5 text-muted-foreground/40 xl:block">
              {j.notes ?? ""}
            </span>
            <div className="flex w-[calc(80px*var(--font-scale))] shrink-0 items-center justify-end gap-0.5 whitespace-nowrap">
              {j.url && (
                <button
                  onClick={(event) => { event.stopPropagation(); void openExternalLink(j.url as string); }}
                  title={j.url}
                  className="rounded-md p-1 text-muted-foreground/50 transition hover:bg-white/10 hover:text-indigo-300"
                >
                  <ExternalLink className="size-3.5" />
                </button>
              )}
              <button
                onClick={(event) => { event.stopPropagation(); void markApplied(j.id); }}
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
                onClick={(event) => { event.stopPropagation(); void remove(j.id); }}
                title="删除"
                className={cn(
                  "rounded-md p-1 transition",
                  del.pendingKey === j.id
                    ? "bg-red-500/20 px-1 text-red-300"
                    : "text-muted-foreground/35 opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-red-300",
                )}
              >
                {del.pendingKey === j.id ? (
                  <span className="text-ui-10">确认？</span>
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
      <JobFormDialog open={Boolean(editing)} job={editing} statuses={statuses} onClose={() => setEditing(null)} onSaved={() => { void refresh(); }} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
