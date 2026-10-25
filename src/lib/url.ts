import { openUrl } from "@tauri-apps/plugin-opener";

/** 媒体/文件类链接（视频流、音视频、压缩包、PDF、图片）——不能交给系统浏览器/播放器直接打开。 */
const MEDIA_RE =
  /\.(ts|mp4|m3u8|mov|avi|mkv|webm|flv|wmv|mp3|wav|flac|aac|m4a|zip|rar|7z|tar|gz|pdf|jpg|jpeg|png|gif|webp|bmp|ico)([?#]|$)/i;

export function isMediaUrl(url: string): boolean {
  return MEDIA_RE.test(url);
}

/**
 * 安全打开外部链接：网页交给系统浏览器；
 * 媒体/文件链接不触发系统播放器，而是复制到剪贴板并返回提示文案（无提示返回 null）。
 */
export async function openExternalLink(url: string): Promise<string | null> {
  if (isMediaUrl(url)) {
    try {
      await navigator.clipboard.writeText(url);
      return "该链接是媒体/文件（视频、PDF 等），已复制到剪贴板，请用浏览器打开";
    } catch {
      return "该链接是媒体/文件（视频、PDF 等），无法直接打开";
    }
  }
  await openUrl(url);
  return null;
}
