/**
 * 统一错误文案。
 *
 * 只在"需要把异常显示给用户"的地方调用（网络、IMAP、写库、抓取）。
 * 内部路径不要用它兜底——TS 已经保证了类型，兜底只会把真正的 bug 藏起来。
 */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
