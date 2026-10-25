import type { MouseEvent as ReactMouseEvent } from "react";
import { Briefcase, Check, ExternalLink, Loader2, Star, Trash2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { splitValues, type CampusRecruit } from "../service";
import { applyUrlOf, deadlineLabel, isExpired } from "../format";

/**
 * 一条校招记录：**单行高密度**（与求职中心其它页签同一套行样式）。
 *
 * 语义（勿回退）：「去投递」只打开网申页、**不写库**；
 * 记成"准备投递"必须用户点书签手动加入。
 */
export function RecruitRow({
  rec,
  synced,
  syncing,
  confirming,
  onContextMenu,
  onApply,
  onSync,
  onDelete,
}: {
  rec: CampusRecruit;
  synced: boolean;
  syncing: boolean;
  confirming: boolean;
  onContextMenu: (e: ReactMouseEvent) => void;
  onApply: (url: string | null) => void;
  onSync: () => void;
  onDelete: () => void;
}) {
  const locations = splitValues(rec.location);
  const expired = isExpired(rec.deadlineIso);
  const applyUrl = applyUrlOf(rec);

  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        "group flex h-9 items-center gap-2 border-b border-white/4 px-3 transition hover:bg-white/5",
        rec.isKey && "bg-amber-400/[0.04]",
      )}
    >
      {/* 公司（重点星标 + 批次） */}
      <span className="flex w-[28%] shrink-0 items-center gap-1.5">
        {rec.isKey && <Star className="size-3 shrink-0 fill-amber-300 text-amber-300" />}
        <span className="min-w-0 truncate text-[12.5px] font-medium" title={rec.company}>
          {rec.company}
        </span>
        {rec.batch && (
          <span className="shrink-0 rounded-full border border-indigo-400/25 bg-indigo-400/10 px-1.5 text-[9.5px] leading-4 text-indigo-200/90">
            {rec.batch}
          </span>
        )}
      </span>

      {/* 职位 */}
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground/70" title={rec.positions ?? ""}>
        {rec.positions ?? "—"}
      </span>

      {/* 地点（窄屏隐藏） */}
      <span
        className="hidden w-[15%] shrink-0 truncate text-[10.5px] text-muted-foreground/45 lg:block"
        title={rec.location ?? ""}
      >
        {locations.length > 0 ? locations.slice(0, 3).join("、") : "—"}
      </span>

      {/* 截止 */}
      <span
        className={cn(
          "w-[74px] shrink-0 text-[10px] tabular-nums",
          rec.deadlineIso
            ? expired
              ? "text-red-400/70 line-through"
              : "text-amber-300/75"
            : "text-muted-foreground/35",
        )}
        title={rec.deadlineIso ? `截止 ${rec.deadlineIso}` : deadlineLabel(rec) ?? "源站未给出截止日期"}
      >
        {rec.deadlineIso ? rec.deadlineIso.slice(5) : (deadlineLabel(rec)?.slice(5) ?? "—")}
      </span>

      {/* 操作 */}
      <div className="flex w-[64px] shrink-0 items-center justify-end gap-0.5">
        <button
          onClick={() => onApply(applyUrl)}
          disabled={!applyUrl}
          title={applyUrl ? `打开投递页面：${applyUrl}` : "这条没有网申链接"}
          className="rounded-md p-1 text-muted-foreground/50 transition hover:bg-white/10 hover:text-indigo-300 disabled:opacity-30"
        >
          <ExternalLink className="size-3.5" />
        </button>
        {synced ? (
          <span title="已在求职中心" className="rounded-md p-1 text-emerald-300">
            <Check className="size-3.5" />
          </span>
        ) : (
          <button
            onClick={onSync}
            disabled={syncing}
            title="加入求职中心的「准备投递」"
            className="rounded-md p-1 text-muted-foreground/40 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-indigo-300 disabled:opacity-60"
          >
            {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <Briefcase className="size-3.5" />}
          </button>
        )}
        <button
          onClick={onDelete}
          title="删除这条"
          className={cn(
            "rounded-md p-1 transition",
            confirming
              ? "bg-red-500/20 px-1 text-red-300"
              : "text-muted-foreground/35 opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-red-300",
          )}
        >
          {confirming ? <span className="text-[10px]">确认？</span> : <Trash2 className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}
