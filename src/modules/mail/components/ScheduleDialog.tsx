import { useCallback, useEffect, useMemo, useState } from "react";
import { errMsg } from "../../../lib/error";
import { Check, Clock, ExternalLink, Link2, Loader2, MapPin, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { cn } from "../../../lib/utils";
import { openExternalLink } from "../../../lib/url";
import { fromLocalInputValue, toLocalInputValue } from "../../../lib/time";
import {
  KIND_LABEL,
  confirmExtraction,
  deleteExtraction,
  ignoreExtraction,
  listCandidates,
  undoExtraction,
  type CandidateKind,
  type ScheduleCandidate,
} from "../extract";

/**
 * AI 识别出的日程候选 → **人工确认** → 写日历。
 *
 * 这是用户拍板的铁律：AI 只产出候选，写日历必须由人点确认。
 * 每条卡片都把「依据原句」和「来源邮件」摆出来，方便核对（模型可能理解错时间）。
 */

const KIND_STYLE: Record<CandidateKind, string> = {
  interview: "border-indigo-400/40 bg-indigo-400/12 text-indigo-200",
  written_test: "border-sky-400/40 bg-sky-400/12 text-sky-200",
  career_talk: "border-teal-400/40 bg-teal-400/12 text-teal-200",
  deadline: "border-amber-400/40 bg-amber-400/12 text-amber-200",
  offer: "border-emerald-400/40 bg-emerald-400/12 text-emerald-200",
  other: "border-white/15 bg-white/6 text-muted-foreground",
};

function fmt(ms: number | null, allDay: boolean): string {
  if (!ms) return "时间待定";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (allDay) return `${date}（全天）`;
  const week = "日一二三四五六"[d.getDay()];
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}（周${week}）`;
}

export function ScheduleDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  /** 确认/忽略后通知外层刷新（候选数与日历都变了） */
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"pending" | "confirmed" | "ignored">("pending");
  const [items, setItems] = useState<ScheduleCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tip, setTip] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", start: "", allDay: false });

  const load = useCallback(
    async (status: typeof tab) => {
      setLoading(true);
      try {
        setItems(await listCandidates(status, 200));
      } catch (e) {
        setTip({ kind: "err", text: errMsg(e) });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (open) void load(tab);
  }, [open, tab, load]);

  const flash = (kind: "ok" | "err", text: string) => {
    setTip({ kind, text });
    window.setTimeout(() => setTip((t) => (t?.text === text ? null : t)), 5000);
  };

  const startEdit = (c: ScheduleCandidate) => {
    setEditing(c.id);
    setDraft({
      title: c.title,
      start: c.startAt ? toLocalInputValue(c.startAt) : "",
      allDay: c.allDay,
    });
  };

  const doConfirm = async (c: ScheduleCandidate, useDraft = false) => {
    setBusy(c.id);
    try {
      const startAt = useDraft && draft.start ? fromLocalInputValue(draft.start) : undefined;
      await confirmExtraction(c.id, {
        title: useDraft ? draft.title : undefined,
        startAt,
        allDay: useDraft ? draft.allDay : undefined,
      });
      setEditing(null);
      await load(tab);
      onChanged();
      flash("ok", `已写入日历：${useDraft ? draft.title : c.title}`);
    } catch (e) {
      flash("err", errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const highConfidence = useMemo(() => items.filter((c) => c.confidence >= 0.85), [items]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-[76vh] flex-col sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4 text-indigo-300" />
            AI 识别出的安排
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            AI 只负责从邮件里找出面试/笔试/截止这些时间点，**写进日历必须由你确认**。
            每条都附了邮件里的原句，时间理解错了就直接改或忽略。
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-center gap-1.5">
          {(["pending", "confirmed", "ignored"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-[11px] transition",
                tab === s
                  ? "border-indigo-400/50 bg-indigo-400/12 text-indigo-200"
                  : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "pending" ? "待确认" : s === "confirmed" ? "已加入日历" : "已忽略"}
            </button>
          ))}
          {tab === "pending" && highConfidence.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-[11px]"
              disabled={!!busy}
              onClick={async () => {
                setBusy("bulk");
                let okCount = 0;
                for (const c of highConfidence) {
                  try {
                    await confirmExtraction(c.id);
                    okCount += 1;
                  } catch (e) {
                    console.warn("[mail] 批量确认失败", c.id, e);
                  }
                }
                await load(tab);
                onChanged();
                setBusy(null);
                flash("ok", `已确认 ${okCount} 条高置信度候选（≥85%）`);
              }}
            >
              {busy === "bulk" ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              确认全部高置信度（{highConfidence.length}）
            </Button>
          )}
        </div>

        {tip && (
          <p
            className={cn(
              "shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px]",
              tip.kind === "ok"
                ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-200"
                : "border-red-400/30 bg-red-500/10 text-red-200",
            )}
          >
            {tip.text}
          </p>
        )}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {loading && (
            <p className="flex items-center justify-center gap-1.5 py-8 text-[11px] text-muted-foreground/50">
              <Loader2 className="size-3 animate-spin" />
              读取候选…
            </p>
          )}
          {!loading && items.length === 0 && (
            <div className="py-10 text-center text-[11px] leading-relaxed text-muted-foreground/50">
              {tab === "pending"
                ? "还没有待确认的候选。在邮箱面板点「AI 扫描」，或在某个会话里点「AI 识别」。"
                : "这里是空的。"}
            </div>
          )}
          {items.map((c) => (
            <article key={c.id} className="rounded-xl border border-white/8 bg-white/3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10px]", KIND_STYLE[c.kind])}>
                  {KIND_LABEL[c.kind]}
                </span>
                {editing === c.id ? (
                  <Input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    className="h-7 min-w-[200px] flex-1 text-xs"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{c.title}</span>
                )}
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums",
                    c.confidence >= 0.85
                      ? "bg-emerald-400/12 text-emerald-200"
                      : c.confidence >= 0.6
                        ? "bg-amber-400/12 text-amber-200"
                        : "bg-red-400/12 text-red-200",
                  )}
                  title="模型对这条的置信度"
                >
                  {Math.round(c.confidence * 100)}%
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/75">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {editing === c.id ? (
                    <input
                      type="datetime-local"
                      value={draft.start}
                      onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                      className="rounded border border-white/10 bg-white/4 px-1 py-0.5 text-[11px] outline-none"
                    />
                  ) : (
                    fmt(c.startAt, c.allDay)
                  )}
                </span>
                {editing === c.id && (
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={draft.allDay}
                      onChange={(e) => setDraft((d) => ({ ...d, allDay: e.target.checked }))}
                    />
                    全天
                  </label>
                )}
                {c.company && <span>公司：{c.company}</span>}
                {c.role && <span>岗位：{c.role}</span>}
                {c.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {c.location}
                  </span>
                )}
                {c.contact && <span>联系人：{c.contact}</span>}
              </div>

              {c.meetingUrl && (
                <button
                  onClick={() => void openExternalLink(c.meetingUrl)}
                  className="mt-1.5 flex max-w-full items-center gap-1 truncate text-[11px] text-indigo-300 hover:underline"
                  title={c.meetingUrl}
                >
                  <Link2 className="size-3 shrink-0" />
                  会议链接：{c.meetingUrl.replace(/^https?:\/\//, "").slice(0, 70)}
                  <ExternalLink className="size-2.5 shrink-0" />
                </button>
              )}

              {c.evidence && (
                <p className="mt-1.5 rounded-lg border border-white/6 bg-white/2 px-2 py-1 text-[11px] leading-relaxed text-muted-foreground/70">
                  <span className="text-muted-foreground/45">依据原句：</span>
                  {c.evidence}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/45">
                  来源：{c.sourceSubject.slice(0, 40)} · {c.sourceFrom}
                </span>
                {c.status === "pending" && editing !== c.id && (
                  <>
                    <Button size="sm" className="h-7 text-[11px]" disabled={!!busy} onClick={() => void doConfirm(c)}>
                      {busy === c.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      确认并写入日历
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => startEdit(c)}>
                      改时间
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] text-muted-foreground"
                      disabled={!!busy}
                      onClick={async () => {
                        await ignoreExtraction(c.id);
                        await load(tab);
                        onChanged();
                      }}
                    >
                      <X className="size-3" />
                      忽略
                    </Button>
                  </>
                )}
                {c.status === "pending" && editing === c.id && (
                  <>
                    <Button size="sm" className="h-7 text-[11px]" disabled={!!busy} onClick={() => void doConfirm(c, true)}>
                      {busy === c.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      按改后的时间写入
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setEditing(null)}>
                      取消
                    </Button>
                  </>
                )}
                {c.status === "confirmed" && (
                  <>
                    <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
                      已写入日历
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={!!busy}
                      onClick={async () => {
                        await undoExtraction(c.id);
                        await load(tab);
                        onChanged();
                        flash("ok", "已撤销（日历里的日程也删掉了）");
                      }}
                    >
                      <RotateCcw className="size-3" />
                      撤销
                    </Button>
                  </>
                )}
                {c.status === "ignored" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    onClick={async () => {
                      await deleteExtraction(c.id);
                      await load(tab);
                      onChanged();
                    }}
                  >
                    <Trash2 className="size-3" />
                    删除记录
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
