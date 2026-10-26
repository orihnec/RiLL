import { Briefcase, ClipboardList, Radar } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useUiStore, type JobTab } from "../../../stores/uiStore";
import { JobsBoard } from "./JobsBoard";
import { PreparingBoard } from "./PreparingBoard";
import { ScoutView } from "../../scout/components/ScoutView";
import { WORKBENCH_BY_ID } from "../../../shell/workbench";
import { JobImportDialog } from "../import/views/JobImportDialog";

const TABS: { id: JobTab; label: string; icon: typeof Briefcase; hint: string }[] = [
  { id: "preparing", label: "准备投递", icon: ClipboardList, hint: "想投但还没投的岗位（来自信息库或手动添加）" },
  { id: "applied", label: "已投递", icon: Briefcase, hint: "投递看板：面试中 / Offer / 已拒绝" },
  { id: "scout", label: "信息库", icon: Radar, hint: "校招汇总抓取 + 多列筛选" },
];

/**
 * 求职中心：把「准备投递 / 已投递 / 校招信息库」合成一个工作台。
 *
 * 三者本来就是同一条流程的三个阶段：看到岗位 → 加入准备 → 投出去 → 跟踪状态。
 * 之前分散在「招聘」「求职」两个工作台 + 一个模态里，来回跳。
 */
export function JobCenterView() {
  const tab = useUiStore((s) => s.jobTab);
  const setTab = useUiStore((s) => s.setJobTab);

  return (
    <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/6 px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.hint}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-ui-11-5 transition",
              tab === t.id
                ? "bg-white/10 font-medium text-foreground"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {WORKBENCH_BY_ID.get("jobs")?.actions?.map((action) => (
            <button key={action.id} onClick={action.run} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-ui-11-5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground">
              <action.icon className="size-3.5" />{action.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "preparing" && <PreparingBoard />}
        {tab === "applied" && <JobsBoard />}
        {tab === "scout" && <ScoutView />}
      </div>
      <JobImportDialog />
    </div>
  );
}
