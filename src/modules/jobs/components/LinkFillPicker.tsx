import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import type { SearchResult } from "../../../kernel/search";
import type { JobApplication } from "../service";

/** 补链接候选：避免自动填错；公众号文章（mp.weixin.qq.com）单独标注。 */
export function LinkFillPicker({
  job,
  results,
  onPick,
  onClose,
}: {
  job: JobApplication | null;
  results: SearchResult[];
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={job !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择 {job?.company} 的招聘链接</DialogTitle>
          <DialogDescription className="text-ui-11">
            优先校招官网与公众号招聘信息，点击一条填入（或取消）
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto py-1">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => onPick(r.url)}
              className="flex flex-col gap-0.5 rounded-lg border border-white/6 bg-white/3 px-2.5 py-2 text-left transition hover:border-indigo-400/30 hover:bg-white/6"
            >
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">
                  {r.title || r.url}
                </span>
                {r.url.includes("mp.weixin.qq.com") && (
                  <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-px text-ui-9 text-emerald-300">
                    公众号
                  </span>
                )}
              </div>
              <span className="truncate font-mono text-ui-10 text-muted-foreground/60">{r.url}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消（不加链接）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
