import { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Briefcase, ExternalLink, Pencil, Plus, RefreshCw, Search, Settings2, Trash2 } from "lucide-react";
import { ContextMenu, type CtxMenuItem } from "../../../components/ui/ContextMenu";
import type { JobApplication } from "../service";
import { useJobsBoard } from "../hooks/useJobsBoard";
import { JobsToolbar, JobsLoading } from "./JobsToolbar";
import { JobsList } from "./JobsList";
import { JobFormDialog } from "./JobFormDialog";
import { JobStatusManagerDialog } from "./JobStatusManagerDialog";
import { LinkFillPicker } from "./LinkFillPicker";

/**
 * 求职监控工作台：状态筛选（自定义状态）+ 关键词搜索 + 表格。
 * 数据与筛选在 useJobsBoard，表格行在 JobsTable，表单/弹窗各自独立。
 */
export function JobsBoard() {
  const b = useJobsBoard();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [statusMgrOpen, setStatusMgrOpen] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (j: JobApplication) => {
    setEditing(j);
    setFormOpen(true);
  };

  /** 行右键：编辑 / 打开或补链接 / 删除。 */
  const rowMenu = (e: ReactMouseEvent, j: JobApplication) => {
    const items: CtxMenuItem[] = [
      { label: "编辑", icon: <Pencil className="size-3.5" />, onSelect: () => openEdit(j) },
      ...(j.url
        ? [
            {
              label: "打开链接",
              icon: <ExternalLink className="size-3.5" />,
              onSelect: () => void b.openLink(j.url as string),
            },
          ]
        : [
            {
              label: "补链接",
              icon: <Search className="size-3.5" />,
              onSelect: () => void b.openFillPicker(j),
            },
          ]),
      {
        label: "删除",
        icon: <Trash2 className="size-3.5" />,
        danger: true,
        confirmLabel: "确认删除？",
        onSelect: () => void b.removeJob(j.id),
      },
    ];
    setCtx({ x: e.clientX, y: e.clientY, items });
  };

  /** 表格空白右键：添加投递 / 管理状态 / 刷新。 */
  const blankMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "添加投递", icon: <Plus className="size-3.5" />, onSelect: openCreate },
        { label: "管理状态", icon: <Settings2 className="size-3.5" />, onSelect: () => setStatusMgrOpen(true) },
        { label: "刷新", icon: <RefreshCw className="size-3.5" />, onSelect: () => void b.refresh() },
      ],
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <JobsToolbar
        jobsCount={b.jobs.length}
        visibleCount={b.visible.length}
        matched={b.terms.length > 0}
        statuses={b.statuses}
        filter={b.filter}
        onFilter={b.setFilter}
        counts={b.counts}
        query={b.query}
        onQuery={b.setQuery}
        searchRef={b.searchRef}
        onClearSearch={b.clearSearch}
        linkMsg={b.linkMsg}
        onAdd={openCreate}
        onManageStatus={() => setStatusMgrOpen(true)}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4" onContextMenu={blankMenu}>
        {b.loading && b.jobs.length === 0 ? (
          <JobsLoading />
        ) : b.visible.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-1.5 text-center text-xs text-muted-foreground/60">
            <Briefcase className="size-5 opacity-50" />
            {b.jobs.length === 0 ? (
              "还没有投递记录，点「添加投递」或在聊天里说「记录一下投了 XX 公司」"
            ) : b.terms.length > 0 ? (
              <>
                没有匹配「{b.query.trim()}」的投递
                <button
                  onClick={b.clearSearch}
                  className="mt-1 text-indigo-300 underline-offset-2 hover:underline"
                >
                  清除搜索
                </button>
              </>
            ) : (
              "该状态下暂无记录"
            )}
          </div>
        ) : (
          <JobsList
            visible={b.visible}
            terms={b.terms}
            statuses={b.statuses}
            sort={b.sort}
            onToggleSort={b.toggleSort}
            confirmDel={b.confirmDel}
            linkState={b.linkState}
            onChangeStatus={(id, sid) => void b.changeStatus(id, sid)}
            onOpenLink={(url) => void b.openLink(url)}
            onFillLink={(j) => void b.openFillPicker(j)}
            onEdit={openEdit}
            onDelete={(id) => void b.removeJob(id)}
            onRowMenu={rowMenu}
          />
        )}
      </div>

      <JobFormDialog
        open={formOpen}
        job={editing}
        statuses={b.statuses}
        onClose={() => setFormOpen(false)}
        onSaved={() => void b.refresh()}
      />

      <JobStatusManagerDialog
        open={statusMgrOpen}
        onClose={() => {
          setStatusMgrOpen(false);
          void b.refresh();
        }}
      />

      <LinkFillPicker
        job={b.fillPicker?.job ?? null}
        results={b.fillPicker?.results ?? []}
        onPick={(url) => void b.pickLink(url)}
        onClose={() => b.setFillPicker(null)}
      />

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
