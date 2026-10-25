import { useEffect, useState } from "react";
import { Folder, Loader2, Mail, MailOpen, RefreshCw, Sparkles, Star, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import type { MailWorkspace } from "../hooks/useMailWorkspace";
import { fmtListDate } from "../format";
import { MessagePane } from "./MessagePane";

/**
 * 第三栏：**一封邮件的阅读区**（普通邮箱的交互）。
 *
 * 打开会话默认显示最新一封；会话里有多封时，上方给一排"谁 · 什么时候"的切换条。
 * 正文整封铺开，不再有"折叠预览 + 阅读全文"这一层。
 */
export function ThreadView({ ws }: { ws: MailWorkspace }) {
  const {
    thread,
    messages,
    loadingMsgs,
    busy,
    activeFolder,
    showImages,
    setShowImages,
    setReaderIndex,
    flash,
    runThreadAi,
    flagThread,
    removeThread,
    setMovePicker,
    moveTargets,
    recoverThread,
  } = ws;

  /** null = 默认最新一封 */
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    setPicked(null); // 换会话回到最新
  }, [thread?.threadId]);

  const idx = picked ?? Math.max(0, messages.length - 1);
  const current = messages[idx];

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {!thread && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground/40">
          <Mail className="size-8" />
          <p className="text-xs">选一个会话，这里显示邮件内容</p>
        </div>
      )}

      {thread && (
        <>
          {/* 会话头：主题 + 操作 */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/6 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{thread.subject}</p>
              <p className="truncate text-[10px] text-muted-foreground/55">
                {thread.messageCount} 封 · {thread.participants.map((p) => p.name || p.address).join("、")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => void runThreadAi()}
                disabled={!!busy}
                title="让 AI 读这场会话，识别面试/笔试/时间安排（只产出候选，确认后才写日历）"
                className="rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-white/8 hover:text-indigo-300 disabled:opacity-40"
              >
                {busy === "aiscan" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
              </button>
              <button
                onClick={() => void flagThread(thread, { flagged: !thread.flagged })}
                disabled={busy === "action"}
                title={thread.flagged ? "取消星标" : "加星标"}
                className={cn(
                  "rounded-md p-1.5 transition hover:bg-white/8",
                  thread.flagged ? "text-amber-300" : "text-muted-foreground/60",
                )}
              >
                <Star className={cn("size-3.5", thread.flagged && "fill-amber-300")} />
              </button>
              <button
                onClick={() => void flagThread(thread, { seen: false })}
                disabled={busy === "action"}
                title="标记未读"
                className="rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground"
              >
                <MailOpen className="size-3.5" />
              </button>
              <button
                onClick={() => setMovePicker(thread)}
                disabled={busy === "action" || moveTargets.length === 0}
                title="移动到…"
                className="rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground disabled:opacity-40"
              >
                <Folder className="size-3.5" />
              </button>
              <button
                onClick={() => void removeThread(thread)}
                disabled={busy === "action"}
                title={activeFolder?.special === "trash" ? "彻底删除" : "移入垃圾箱"}
                className="rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-red-500/15 hover:text-red-300"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>

          {/* 会话里多封时：一行一封的切换条 */}
          {messages.length > 1 && (
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/6 px-3 py-1.5">
              {messages.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => setPicked(i)}
                  className={cn(
                    "shrink-0 rounded-lg px-2 py-1 text-[10.5px] transition",
                    i === idx
                      ? "bg-indigo-400/15 text-indigo-100"
                      : "text-muted-foreground/70 hover:bg-white/6 hover:text-foreground",
                  )}
                  title={`${m.fromName || m.fromAddress} · ${fmtListDate(m.date)}`}
                >
                  {m.fromName || m.fromAddress || "(未知)"} · {fmtListDate(m.date)}
                </button>
              ))}
            </div>
          )}

          {/* 正文 */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingMsgs && (
              <p className="flex items-center justify-center gap-1.5 py-10 text-[11px] text-muted-foreground/50">
                <Loader2 className="size-3 animate-spin" />
                读取会话…
              </p>
            )}

            {!loadingMsgs && messages.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <p className="text-[11px] leading-relaxed text-muted-foreground/55">
                  这个会话没有取到邮件
                  <br />
                  <span className="text-muted-foreground/40">
                    （会话归属需要重算——老数据是在会话功能之前同步的）
                  </span>
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => void recoverThread()}
                  disabled={busy === "organize"}
                >
                  {busy === "organize" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  重算会话并重新打开
                </Button>
              </div>
            )}

            {current && (
              <MessagePane
                key={current.id}
                message={current}
                showImages={!!showImages[current.id]}
                onToggleImages={() =>
                  setShowImages((prev) => ({ ...prev, [current.id]: !prev[current.id] }))
                }
                onOpenReader={() => setReaderIndex(idx)}
                onError={(text) => flash("err", text)}
                onOk={(text) => flash("ok", text)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
