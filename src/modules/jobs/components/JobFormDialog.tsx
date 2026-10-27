import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import type { JobApplication } from "../service";
import type { JobStatusDef } from "../statusStore";
import { useJobForm } from "../hooks/useJobForm";
import { JobSourceDetails } from "./JobSourceDetails";

/** 创建/编辑投递记录（状态取自自定义状态列表）。 */
export function JobFormDialog({
  open,
  job,
  statuses,
  onClose,
  onSaved,
}: {
  open: boolean;
  job: JobApplication | null;
  statuses: JobStatusDef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fallback = statuses[0]?.id ?? "applied";
  const { company, setCompany, position, setPosition, status, setStatus, url, setUrl, notes, setNotes,
    appliedDate, setAppliedDate, busy, error, save } = useJobForm(open, job, fallback, onSaved, onClose);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{job ? "编辑投递" : "添加投递"}</DialogTitle>
          <DialogDescription className="sr-only">投递记录</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">公司 *</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="公司名称" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">职位 *</Label>
              <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="职位名称" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">状态</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: s.bar }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">投递日期</Label>
              <Input type="date" value={appliedDate} disabled={status === "preparing"} onChange={(e) => setAppliedDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">投递链接（可选）</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">备注（可选）</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="薪资、地点、面试安排…"
              className="resize-none"
            />
          </div>
          <JobSourceDetails extras={job?.extras ?? null} />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
