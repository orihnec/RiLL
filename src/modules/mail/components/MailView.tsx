import {
  Check,
  CloudDownload,
  Folder,
  Loader2,
  Mail,
  MailOpen,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { ContextMenu } from "../../../components/ui/ContextMenu";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Input } from "../../../components/ui/input";
import { cn } from "../../../lib/utils";
import { useUiStore } from "../../../stores/uiStore";
import { MessageReader } from "./MessageReader";
import { AccountDialog } from "./AccountDialog";
import { ScheduleDialog } from "./ScheduleDialog";
import { AccountRail } from "./AccountRail";
import { ThreadList } from "./ThreadList";
import { ThreadView } from "./ThreadView";
import { folderIcon } from "./folderIcon";
import { pendingCount } from "../extract";
import { applyMailWatch } from "../watch";
import { listFolders } from "../service";
import { useMailWorkspace } from "../hooks/useMailWorkspace";

/**
 * 邮箱（**一级页面**，不再是模态浮层）。
 *
 * 左：账号（可折叠）+ 文件夹树（未读徽标）
 * 中：会话列表（一行一个会话）
 * 右：会话内邮件按时间从上到下堆叠（像聊天记录）
 *
 * 状态与动作全在 useMailWorkspace；三栏分别是 AccountRail / ThreadList / ThreadView。
 */
export function MailView() {
  const ws = useMailWorkspace();
  const {
    unreadTotal,
    watch,
    accounts,
    activeAccount,
    activeFolder,
    notifyAccounts,
    keyword,
    setKeyword,
    unreadOnly,
    setUnreadOnly,
    thread,
    messages,
    openThreadById,
    readerIndex,
    setReaderIndex,
    setActiveAccountId,
    setActiveFolderId,
    busy,
    progress,
    tip,
    flash,
    syncOne,
    syncAll,
    fillBodies,
    moveThread,
    missing,
    badBodies,
    movePicker,
    setMovePicker,
    moveTargets,
    organize,
    askScan,
    runScan,
    scanAsk,
    setScanAsk,
    scheduleOpen,
    setScheduleOpen,
    pending,
    setPending,
    ctx,
    setCtx,
    dialog,
    setDialog,
    loadAccounts,
  } = ws;

  return (
    <>
      <div className="glass flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-3xl">
        {/* 顶部：标题 / 搜索 / 动作 */}
        <div className="flex shrink-0 flex-row flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/6 px-3 py-2 text-left">
          <div className="flex shrink-0 items-center gap-2 text-sm font-semibold">
            <Mail className="size-4 text-indigo-300" />
            邮箱
          </div>
            <span className="flex min-w-0 flex-1 shrink items-center gap-1.5 truncate text-[10px] text-muted-foreground/60">
              {accounts.length} 个账号
              {unreadTotal > 0 ? ` · ${unreadTotal} 封未读` : ""}
              {notifyAccounts > 0 && (
                <>
                  {" · "}
                  {(() => {
                    const live = accounts.filter((a) => a.notify && watch[a.id]?.status === "ok").length;
                    const bad = accounts.filter((a) => a.notify && watch[a.id] && watch[a.id].status !== "ok").length;
                    if (live === 0 && bad === 0) return "实时接收启动中…";
                    const first = accounts.find((a) => a.notify && watch[a.id]?.status === "ok");
                    const mode = first ? watch[first.id]?.mode : "";
                    return `实时接收 ${live}/${notifyAccounts}${bad > 0 ? ` · 异常 ${bad}` : ""}${
                      mode === "idle" ? "（IDLE 推送）" : mode === "poll" ? "（快速查询）" : ""
                    }`;
                  })()}
                </>
              )}
            </span>
            <div className="flex min-w-[220px] flex-1 items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索主题、发件人、正文（整个会话命中就显示）"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <button
                onClick={() => setUnreadOnly((v) => !v)}
                title="只看未读会话"
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] transition",
                  unreadOnly
                    ? "border-indigo-400/50 bg-indigo-400/12 text-indigo-200"
                    : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
                )}
              >
                <MailOpen className="size-3.5" />
                未读
                {unreadTotal > 0 && <span className="tabular-nums">{unreadTotal}</span>}
              </button>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {/* AI 排程（M3）：扫描本文件夹 + 打开待确认候选 */}
              <Button
                size="sm"
                variant={pending > 0 ? "default" : "outline"}
                className="h-8 px-2.5 text-[11px]"
                onClick={() => void askScan()}
                disabled={!!busy || !activeFolder}
                title="让 AI 读最近的邮件，找出面试/笔试/宣讲会/截止时间（只产出候选，不自动写日历）"
              >
                {busy === "aiscan" ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                AI 扫描
              </Button>
              {pending > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-[11px]"
                  onClick={() => setScheduleOpen(true)}
                  title="查看 AI 识别出的候选并确认写入日历"
                >
                  <Check className="size-3" />
                  待确认 {pending}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-[11px]"
                onClick={() => void syncAll()}
                disabled={!!busy || accounts.length === 0}
                title="同步所有账号的收件箱（同一账号的同步会自动排队，不会并发开连接）"
              >
                {busy === "all" ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                全部同步
              </Button>

              {/* 低频维护动作收进一个菜单，主界面只留三个高频按钮 */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 px-2 text-[11px]" title="会话与正文维护">
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-1">
                  <button
                    onClick={() => void organize(false)}
                    disabled={!!busy || !activeFolder}
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/8 disabled:opacity-40"
                  >
                    <span className="flex items-center gap-1.5 text-[11.5px]">
                      {busy === "organize" ? <Loader2 className="size-3 animate-spin" /> : <Folder className="size-3" />}
                      整理会话
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">本地重算，不联网</span>
                  </button>

                  <button
                    onClick={() => void organize(true)}
                    disabled={!!busy || !activeFolder}
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/8 disabled:opacity-40"
                  >
                    <span className="flex items-center gap-1.5 text-[11.5px]">
                      <RefreshCw className="size-3" />
                      重建会话（重读邮件头）
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                      老邮件缺线索字段时更准；会重新拉一遍邮件头
                    </span>
                  </button>

                  <button
                    onClick={() => void fillBodies()}
                    disabled={!!busy || !activeFolder}
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/8 disabled:opacity-40"
                  >
                    <span className="flex items-center gap-1.5 text-[11.5px]">
                      {busy === "prefetch" ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <CloudDownload className="size-3" />
                      )}
                      {badBodies > 0 ? `修复乱码正文 ${badBodies}` : "补正文"}
                      {missing > 0 && badBodies === 0 && (
                        <span className="text-[10px] text-muted-foreground/60">待补 {missing}</span>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                      下载正文缓存（列表摘要 / 检索 / AI 识别都要用）
                    </span>
                  </button>
                </PopoverContent>
              </Popover>

              <Button
                size="sm"
                className="h-8 px-2.5 text-[11px]"
                onClick={() => setDialog({ open: true, editing: null })}
              >
                <Plus className="size-3" />
                添加邮箱
              </Button>
              <button
                onClick={() => useUiStore.getState().setAppView("calendar")}
                title="回到日历"
                className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/4 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {(progress || tip || scanAsk) && (
            <div className="shrink-0 px-3 pt-1.5">
              {progress && (
                <p className="flex items-center gap-1.5 text-[11px] text-indigo-300/85">
                  <Loader2 className="size-3 animate-spin" />
                  {progress}
                </p>
              )}
              {scanAsk && (
                <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-400/8 px-2.5 py-1.5 text-[11px] text-indigo-100">
                  <Sparkles className="size-3 shrink-0" />
                  <span>
                    将把 <b>{scanAsk.messages}</b> 封邮件正文（约 {Math.round(scanAsk.chars / 1000)} 千字）发给模型识别
                    {scanAsk.skippedNoBody > 0 ? `；另有 ${scanAsk.skippedNoBody} 封没缓存正文会跳过` : ""}
                  </span>
                  <div className="ml-auto flex gap-1.5">
                    <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => void runScan()}>
                      开始识别
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setScanAsk(null)}>
                      取消
                    </Button>
                  </div>
                </div>
              )}
              {tip && (
                <p
                  className={cn(
                    "mt-1 rounded-lg border px-2.5 py-1.5 text-[11px]",
                    tip.kind === "ok"
                      ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-200"
                      : "border-red-400/30 bg-red-500/10 text-red-200",
                  )}
                >
                  {tip.text}
                </p>
              )}
            </div>
          )}

          <div className="flex min-h-0 flex-1">
            <AccountRail ws={ws} />
            <ThreadList ws={ws} />
            <ThreadView ws={ws} />
          </div>
        </div>

      {/* 移动到… */}
      {movePicker && (
        <div className="fixed inset-0 z-[60]" onClick={() => setMovePicker(null)}>
          <div
            className="absolute right-8 top-24 max-h-[50vh] w-56 overflow-y-auto rounded-xl border border-white/10 bg-[var(--overlay)] p-1.5 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground/50">移动到</p>
            {moveTargets.map((f) => (
              <button
                key={f.id}
                onClick={() => activeAccount && void moveThread(movePicker, f)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-muted-foreground transition hover:bg-white/6 hover:text-foreground"
              >
                {folderIcon(f.special)}
                <span className="truncate">{f.name}</span>
              </button>
            ))}
            {moveTargets.length === 0 && (
              <p className="px-2 py-2 text-[11px] text-muted-foreground/50">没有其它文件夹</p>
            )}
          </div>
        </div>
      )}

      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />
      )}

      <MessageReader
        open={readerIndex !== null}
        messages={messages}
        index={readerIndex ?? 0}
        onIndexChange={setReaderIndex}
        onClose={() => setReaderIndex(null)}
        onMessageUpdated={() => void openThreadById(thread?.threadId ?? "")}
        onError={(t) => flash("err", t)}
        onOk={(t) => flash("ok", t)}
      />

      <ScheduleDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onChanged={() => void pendingCount().then(setPending)}
      />

      <AccountDialog
        key={`${dialog.editing?.id ?? "new"}-${dialog.open}`}
        open={dialog.open}
        editing={dialog.editing}
        onClose={() => setDialog({ open: false, editing: null })}
        onSaved={async (accountId) => {
          setDialog({ open: false, editing: null });
          await loadAccounts();
          // 实时接收配置可能变了 → 让 Rust 侧的监听线程与配置对齐（幂等）
          void applyMailWatch();
          if (accountId) {
            setActiveAccountId(accountId);
            const list = await listFolders(accountId);
            const inbox = list.find((f) => f.special === "inbox");
            if (inbox) setActiveFolderId(inbox.id);
            flash("ok", "邮箱已添加，正在同步收件箱…");
            void syncOne(accountId, inbox);
          }
        }}
      />
    </>
  );
}
