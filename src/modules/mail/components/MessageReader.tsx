import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errMsg } from "../../../lib/error";
import {
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Download,
  ExternalLink,
  ImageOff,
  Link2,
  Loader2,
  Paperclip,
  Star,
  X,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { cn } from "../../../lib/utils";
import { openExternalLink } from "../../../lib/url";
import { save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { linksFromText, sanitizeMailHtml } from "../sanitize";
import {
  fetchBody,
  getAccount,
  getFolder,
  rustConfigOf,
  saveAttachment,
  saveMessageBody,
  type MailMessage,
} from "../service";

/**
 * **二级阅读界面**：把一封邮件的完整正文铺开看（会话列表里那层只给折叠预览）。
 *
 * 为什么要单独一层：邮件（尤其营销/校招系统发的）常按 600px 固定宽 + 大图排版，
 * 挤在三栏布局的会话流里必然横向溢出、要来回滚。这里给足宽度与高度，
 * 并用注入的 CSS 复位把内容压回容器内。
 *
 * 打开方式：会话里点邮件卡片的「阅读视图」或双击正文；左右可切换同一会话的其它邮件。
 */
export function MessageReader({
  open,
  messages,
  index,
  onIndexChange,
  onClose,
  onMessageUpdated,
  onError,
  onOk,
}: {
  open: boolean;
  messages: MailMessage[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** 正文/星标变化后通知外层刷新 */
  onMessageUpdated: () => void;
  onError: (text: string) => void;
  onOk: (text: string) => void;
}) {
  const message = messages[index] ?? null;
  const [showImages, setShowImages] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // 换邮件时重置"显示图片"
    setShowImages(false);
  }, [message?.id]);

  const sanitized = useMemo(
    () => (message?.bodyHtml ? sanitizeMailHtml(message.bodyHtml, showImages) : null),
    [message?.bodyHtml, showImages],
  );
  const links = useMemo(
    () =>
      message?.bodyHtml
        ? sanitizeMailHtml(message.bodyHtml, showImages).links
        : linksFromText(message?.bodyText ?? ""),
    [message, showImages],
  );

  const loadBody = useCallback(async () => {
    if (!message) return;
    setLoadingBody(true);
    try {
      const folder = await getFolder(message.folderId);
      const account = await getAccount(message.accountId);
      if (!folder || !account) throw new Error("找不到邮件所属账号/文件夹");
      const cfg = await rustConfigOf(account.id);
      const body = await fetchBody(cfg, folder.raw, message.uid);
      await saveMessageBody(message.id, body);
      onOk("正文已缓存");
      onMessageUpdated();
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setLoadingBody(false);
    }
  }, [message, onError, onOk, onMessageUpdated]);

  const save = useCallback(
    async (attIndex: number, name: string) => {
      if (!message) return;
      try {
        const folder = await getFolder(message.folderId);
        const account = await getAccount(message.accountId);
        if (!folder || !account) throw new Error("找不到邮件所属账号");
        const path = await saveFileDialog({ defaultPath: name || "attachment.bin" });
        if (!path) return;
        const cfg = await rustConfigOf(account.id);
        const size = await saveAttachment(cfg, folder.raw, message.uid, attIndex, path);
        onOk(`已保存（${Math.round(size / 1024)} KB）`);
      } catch (e) {
        onError(errMsg(e));
      }
    },
    [message, onError, onOk],
  );

  // 左右方向键切换同一会话的其它邮件
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && index < messages.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, messages.length, onIndexChange]);

  if (!message) return null;
  const blocked = sanitized?.blockedImages ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[1000px]"
      >
        <DialogHeader className="flex shrink-0 flex-row items-center gap-2 border-b border-white/6 px-3 py-2 text-left">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[13px]">{message.subject}</DialogTitle>
            <p className="truncate text-[11px] text-muted-foreground/60">
              {message.fromName ? `${message.fromName} · ` : ""}
              {message.fromAddress}
              {message.toAddress ? ` → ${message.toAddress}` : ""} ·{" "}
              {new Date(message.date).toLocaleString("zh-CN", { hour12: false })}
              {message.size ? ` · ${Math.round(message.size / 1024)} KB` : ""}
            </p>
          </div>
          <DialogDescription className="sr-only">邮件阅读视图</DialogDescription>
          <div className="flex shrink-0 items-center gap-1">
            {messages.length > 1 && (
              <>
                <button
                  onClick={() => onIndexChange(index - 1)}
                  disabled={index === 0}
                  title="上一封（←）"
                  className="rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="px-0.5 text-[10px] tabular-nums text-muted-foreground/50">
                  {index + 1}/{messages.length}
                </span>
                <button
                  onClick={() => onIndexChange(index + 1)}
                  disabled={index >= messages.length - 1}
                  title="下一封（→）"
                  className="rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-white/8 hover:text-foreground disabled:opacity-30"
                >
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}
            <button
              onClick={() => setShowImages((v) => !v)}
              title={showImages ? "已显示远程图片（对方可据此确认你已读）" : "远程图片默认拦截，点此显示"}
              className={cn(
                "rounded-md p-1.5 transition hover:bg-white/8",
                showImages ? "text-amber-300" : "text-muted-foreground/60",
              )}
            >
              <ImageOff className="size-4" />
            </button>
            {message.flagged && <Star className="size-4 fill-amber-300 text-amber-300" />}
            <button
              onClick={onClose}
              title="关闭（Esc）"
              className="ml-1 flex size-8 items-center justify-center rounded-lg border border-white/8 bg-white/4 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!message.bodyFetchedAt && (
            <div className="flex items-center gap-2 py-3">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void loadBody()} disabled={loadingBody}>
                {loadingBody ? <Loader2 className="size-3 animate-spin" /> : <CloudDownload className="size-3" />}
                读取正文
              </Button>
              <span className="text-[10px] text-muted-foreground/45">正文按需下载，读过就缓存在本地</span>
            </div>
          )}

          {blocked > 0 && !showImages && (
            <button
              onClick={() => setShowImages(true)}
              className="mb-2 flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200"
            >
              远程图片已拦截 {blocked} 张（避免对方收到"已读回执"）· 点此显示
            </button>
          )}

          {message.bodyHtml && sanitized ? (
            <iframe
              ref={frameRef}
              title={`reader-${message.uid}`}
              sandbox="allow-same-origin"
              scrolling="no"
              srcDoc={sanitized.html}
              onLoad={() => {
                const el = frameRef.current;
                try {
                  // 阅读视图里给足高度：能显示多少显示多少，不做 360px 折叠
                  const h = el?.contentDocument?.documentElement?.scrollHeight ?? 0;
                  if (el && h > 0) el.style.height = `${h + 16}px`;
                } catch {
                  /* 读不到就保持默认 */
                }
              }}
              className="w-full rounded-lg border border-white/8"
              style={{ background: "#ffffff", colorScheme: "light" }}
            />
          ) : message.bodyText ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-foreground/90">
              {message.bodyText}
            </pre>
          ) : (
            !message.bodyFetchedAt && (
              <p className="py-6 text-center text-[11px] text-muted-foreground/50">点上面的「读取正文」把内容取下来</p>
            )
          )}

          {message.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {message.attachments.map((a) => (
                <button
                  key={a.index}
                  onClick={() => void save(a.index, a.name)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/4 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
                >
                  <Download className="size-3" />
                  <span className="max-w-[220px] truncate">{a.name}</span>
                  <span className="text-[10px] text-muted-foreground/50">{Math.round(a.size / 1024)} KB</span>
                </button>
              ))}
            </div>
          )}

          {links.length > 0 && (
            <div className="mt-3 rounded-lg border border-white/6 bg-white/2 p-2">
              <p className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground/50">
                <Link2 className="size-3" />
                正文里的链接（点击前请自行确认，邮件链接可能是钓鱼）
              </p>
              <div className="flex flex-wrap gap-1.5">
                {links.slice(0, 12).map((l) => (
                  <button
                    key={l.href}
                    onClick={() => void openExternalLink(l.href)}
                    className="flex max-w-[300px] items-center gap-1 rounded-md border border-white/8 px-1.5 py-0.5 text-[10px] text-indigo-300 transition hover:bg-white/6"
                    title={l.href}
                  >
                    <ExternalLink className="size-2.5 shrink-0" />
                    <span className="truncate">{(l.text || l.href).replace(/^https?:\/\//, "")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {message.attachments.length === 0 && !message.bodyFetchedAt && (
            <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground/40">
              <Paperclip className="size-3" />
              正文没下载时看不到附件列表
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
