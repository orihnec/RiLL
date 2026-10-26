import { useMemo, useState } from "react";
import { save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { CloudDownload, Download, ExternalLink, Loader2, Maximize2, Paperclip, Star } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { openExternalLink } from "../../../lib/url";
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
import { avatarHue, errText, fmtFullDate, initials } from "../format";
import { useMailFrame } from "../hooks/useMailFrame";

/**
 * 单封邮件的阅读区（**普通邮箱的样子**：整封正文直接铺开，不再折叠预览）。
 *
 * HTML 走 iframe `sandbox="allow-same-origin"`（不给 allow-scripts），高度按内容自适应。
 */
export function MessagePane({
  message,
  showImages,
  onToggleImages,
  onOpenReader,
  onError,
  onOk,
}: {
  message: MailMessage;
  showImages: boolean;
  onToggleImages: () => void;
  onOpenReader?: () => void;
  onError: (text: string) => void;
  onOk: (text: string) => void;
}) {
  const { frameRef, height, onLoad } = useMailFrame();
  const [loadingBody, setLoadingBody] = useState(false);

  const html = useMemo(
    () => (message.bodyHtml ? sanitizeMailHtml(message.bodyHtml, showImages) : null),
    [message.bodyHtml, showImages],
  );
  const links = useMemo(
    () =>
      message.bodyHtml
        ? sanitizeMailHtml(message.bodyHtml, showImages).links
        : linksFromText(message.bodyText ?? ""),
    [message.bodyHtml, message.bodyText, showImages],
  );
  const blockedImages = html?.blockedImages ?? 0;

  const loadBody = async () => {
    setLoadingBody(true);
    try {
      const folder = await getFolder(message.folderId);
      const account = await getAccount(message.accountId);
      if (!folder || !account) throw new Error("找不到邮件所属账号/文件夹");
      const body = await fetchBody(await rustConfigOf(account.id), folder.raw, message.uid);
      await saveMessageBody(message.id, body);
      onOk("正文已缓存");
    } catch (e) {
      onError(errText(e));
    } finally {
      setLoadingBody(false);
    }
  };

  const save = async (index: number, name: string) => {
    try {
      const folder = await getFolder(message.folderId);
      const account = await getAccount(message.accountId);
      if (!folder || !account) throw new Error("找不到邮件所属账号");
      const path = await saveFileDialog({ defaultPath: name || "attachment.bin" });
      if (!path) return;
      const size = await saveAttachment(await rustConfigOf(account.id), folder.raw, message.uid, index, path);
      onOk(`已保存（${Math.round(size / 1024)} KB）`);
    } catch (e) {
      onError(errText(e));
    }
  };

  return (
    <article className="flex flex-col">
      {/* 发件人 / 收件人 / 时间 */}
      <header className="flex items-start gap-2.5 border-b border-white/6 px-4 py-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ui-10 font-medium text-white/90"
          style={{ background: `hsl(${avatarHue(message.fromAddress ?? "?")} 45% 42%)` }}
        >
          {initials(message.fromName ?? "", message.fromAddress ?? "")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui-13 font-medium">
            {message.fromName || message.fromAddress || "(未知发件人)"}
            <span className="ml-1.5 text-ui-10 font-normal text-muted-foreground/50">
              {message.fromAddress}
            </span>
            {message.flagged && <Star className="ml-1.5 inline size-3 fill-amber-300 text-amber-300" />}
          </p>
          <p className="truncate text-ui-10 text-muted-foreground/45">
            收件人 {message.toAddress ?? "—"} · {fmtFullDate(message.date)}
            {message.size ? ` · ${Math.round(message.size / 1024)} KB` : ""}
          </p>
        </div>
        {onOpenReader && (
          <button
            onClick={onOpenReader}
            title="全屏阅读"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground/50 transition hover:bg-white/8 hover:text-foreground"
          >
            <Maximize2 className="size-3.5" />
          </button>
        )}
        {message.attachments.length > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-ui-10 text-muted-foreground/60">
            <Paperclip className="size-3" />
            {message.attachments.length}
          </span>
        )}
      </header>

      <div className="px-4 py-3">
        {!message.bodyFetchedAt && (
          <div className="flex items-center gap-2 py-4">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-ui-11"
              onClick={() => void loadBody()}
              disabled={loadingBody}
            >
              {loadingBody ? <Loader2 className="size-3 animate-spin" /> : <CloudDownload className="size-3" />}
              读取正文
            </Button>
            <span className="text-ui-10 text-muted-foreground/45">
              正文按需下载，读过就永久缓存在本地
            </span>
          </div>
        )}

        {message.bodyHtml && html ? (
          <>
            {blockedImages > 0 && !showImages && (
              <button
                onClick={onToggleImages}
                className="mb-2 flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-ui-10 text-amber-200"
              >
                远程图片已拦截 {blockedImages} 张（保护隐私，避免已读回执）· 点此显示
              </button>
            )}
            {/* 正文整封铺开：高度按内容自适应，不折叠、不内层滚动 */}
            <iframe
              ref={frameRef}
              title={`mail-${message.uid}`}
              sandbox="allow-same-origin"
              scrolling="no"
              srcDoc={html.html}
              onLoad={onLoad}
              className="w-full rounded-lg border border-white/8"
              style={{ height, background: "#ffffff", colorScheme: "light" }}
            />
          </>
        ) : (
          message.bodyText && (
            <pre className="whitespace-pre-wrap break-words font-sans text-ui-12-5 leading-relaxed text-foreground/85">
              {message.bodyText}
            </pre>
          )
        )}

        {message.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {message.attachments.map((a) => (
              <button
                key={a.index}
                onClick={() => void save(a.index, a.name)}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/4 px-2 py-1 text-ui-11 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
              >
                <Download className="size-3" />
                <span className="max-w-[200px] truncate">{a.name}</span>
                <span className="text-ui-10 text-muted-foreground/50">{Math.round(a.size / 1024)} KB</span>
              </button>
            ))}
          </div>
        )}

        {links.length > 0 && (
          <details className="mt-3 rounded-lg border border-white/6 bg-white/2 px-2 py-1.5">
            <summary className="cursor-pointer text-ui-10 text-muted-foreground/50">
              正文里的 {links.length} 个链接（点开前请自行确认，邮件链接可能是钓鱼）
            </summary>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {links.slice(0, 12).map((l) => (
                <button
                  key={l.href}
                  onClick={() => void openExternalLink(l.href)}
                  className="flex max-w-[280px] items-center gap-1 rounded-md border border-white/8 px-1.5 py-0.5 text-ui-10 text-indigo-300 transition hover:bg-white/6"
                  title={l.href}
                >
                  <ExternalLink className="size-2.5 shrink-0" />
                  <span className="truncate">{(l.text || l.href).replace(/^https?:\/\//, "")}</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </article>
  );
}
