/* 邮箱面板的纯函数与文案工具（无 React 依赖）。 */

/** 会话列表每页条数（滚动到底自动加载下一页）。 */
export const PAGE_SIZE = 40;

/** 列表里的相对时间：今天显示时分，今年显示月/日，跨年显示年月日。 */
export function fmtListDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 完整时间：YYYY-MM-DD HH:mm。 */
export function fmtFullDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 头像文字：中文取末两字，其它取前两字母；无名字退回收件人前缀。 */
export function initials(name: string, address: string): string {
  const n = name.trim();
  if (n) return /[\u4e00-\u9fa5]/.test(n) ? n.slice(-2) : n.slice(0, 2).toUpperCase();
  return (address.split("@")[0] ?? "?").slice(0, 2).toUpperCase();
}

/** 地址 → 稳定头像底色（同一人总是同色）。 */
export function avatarHue(address: string): number {
  let h = 0;
  for (const c of address) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** 统一异常文案（沿用旧名，实现走 lib/error 的 errMsg）。 */
export { errMsg as errText } from "../../lib/error";
