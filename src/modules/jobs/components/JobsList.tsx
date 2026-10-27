import type { MouseEvent as ReactMouseEvent } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Search, Trash2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { JobApplication } from "../service";
import type { JobStatusDef } from "../statusStore";
import type { SortKey } from "../format";
import { formatAppliedAt } from "../format";
import { Highlight } from "./Highlight";
import { StatusCell } from "./StatusCell";

/**
 * 投递列表：**单行高密度**（一行一份投递，hover 才出操作）。
 *
 * 公司/职位按比例分配，状态、日期和操作列随字号扩展；窄窗口可横向滚动。
 * 一屏能看十几行；备注收成 tooltip + 编辑里可改。
 */
export function JobsList({
  visible,
  terms,
  statuses,
  sort,
  onToggleSort,
  confirmDel,
  linkState,
  onChangeStatus,
  onOpenLink,
  onFillLink,
  onEdit,
  onDelete,
  onRowMenu,
}: {
  visible: JobApplication[];
  terms: string[];
  statuses: JobStatusDef[];
  sort: { key: SortKey; dir: "asc" | "desc" };
  onToggleSort: (k: SortKey) => void;
  confirmDel: string | null;
  linkState: Record<string, "busy" | "fail">;
  onChangeStatus: (id: string, status: string) => void;
  onOpenLink: (url: string) => void;
  onFillLink: (j: JobApplication) => void;
  onEdit: (j: JobApplication) => void;
  onDelete: (id: string) => void;
  onRowMenu: (e: ReactMouseEvent, j: JobApplication) => void;
}) {
  return (
    <div className="flex min-w-[calc(560px*var(--font-scale))] flex-col">
      {/* 表头：窄、浅、只留排序入口 */}
      <div className="sticky top-0 z-10 flex items-center gap-2 whitespace-nowrap border-b border-white/6 px-3 pb-1 pt-0.5 text-ui-10 text-muted-foreground/45 backdrop-blur">
        <span className="w-[30%] shrink-0">公司</span>
        <span className="min-w-0 flex-1">职位</span>
        <span className="w-[calc(74px*var(--font-scale))] shrink-0">状态</span>
        <button
          onClick={() => onToggleSort("applied_at")}
          className="flex w-[calc(62px*var(--font-scale))] shrink-0 items-center gap-0.5 transition hover:text-foreground"
          title="按投递日期排序"
        >
          投递
          {sort.key === "applied_at" && sort.dir === "asc" ? (
            <ArrowUp className="size-2.5" />
          ) : (
            <ArrowDown className={cn("size-2.5", sort.key !== "applied_at" && "opacity-0")} />
          )}
        </button>
        <span className="hidden min-w-0 flex-1 xl:block">备注</span>
        <span className="w-[calc(64px*var(--font-scale))] shrink-0 text-right">操作</span>
      </div>

      {visible.map((j) => (
        <div
          key={j.id}
          onClick={() => onEdit(j)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRowMenu(e, j);
          }}
          title={j.notes ? `${j.position}\n${j.notes}` : j.position}
          className="group flex min-h-9 cursor-pointer items-center gap-2 border-b border-white/4 px-3 py-1 transition hover:bg-white/5"
        >
          <span className="w-[30%] shrink-0 truncate text-ui-12-5 font-medium">
            <Highlight text={j.company} terms={terms} />
          </span>
          <span className="min-w-0 flex-1 truncate text-ui-11-5 text-foreground/70">
            <Highlight text={j.position} terms={terms} />
          </span>
          <span className="w-[calc(74px*var(--font-scale))] shrink-0">
            <StatusCell job={j} statuses={statuses} onChange={(sid) => onChangeStatus(j.id, sid)} />
          </span>
          <span className="w-[calc(62px*var(--font-scale))] shrink-0 whitespace-nowrap text-ui-10 tabular-nums text-muted-foreground/55">
            {formatAppliedAt(j.applied_at)}
          </span>
          <span className="hidden min-w-0 flex-1 truncate text-ui-10-5 text-muted-foreground/40 xl:block">
            {j.notes ?? ""}
          </span>
          <div className="flex w-[calc(64px*var(--font-scale))] shrink-0 items-center justify-end gap-0.5 whitespace-nowrap">
            {j.url ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenLink(j.url as string);
                }}
                title={`打开：${j.url}`}
                className="rounded-md p-1 text-indigo-300/70 transition hover:bg-white/10 hover:text-indigo-300"
              >
                <ExternalLink className="size-3.5" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFillLink(j);
                }}
                title="搜索校招官网 / 公众号，选一个填入"
                className={cn(
                  "rounded-md p-1 transition",
                  linkState[j.id] === "busy"
                    ? "text-amber-300"
                    : linkState[j.id] === "fail"
                      ? "text-red-300"
                      : "text-muted-foreground/35 hover:bg-white/10 hover:text-indigo-300",
                )}
              >
                {linkState[j.id] === "busy" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Search className="size-3.5" />
                )}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(j.id);
              }}
              title="删除"
              className={cn(
                "rounded-md p-1 transition",
                confirmDel === j.id
                  ? "bg-red-500/20 px-1 text-red-300"
                  : "text-muted-foreground/35 opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-red-300",
              )}
            >
              {confirmDel === j.id ? <span className="text-ui-10">确认？</span> : <Trash2 className="size-3.5" />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
