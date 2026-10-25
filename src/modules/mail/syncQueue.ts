/**
 * 按账号串行化同步。
 *
 * 同一个邮箱可能被三条链路同时触发同步：
 *   1) 界面按钮（全部同步 / 同步此邮箱）
 *   2) 后台 tick（每分钟，按账号间隔）
 *   3) Rust 实时监听收到"有新邮件"事件
 *
 * 三条各开一条 IMAP 连接 → 163/QQ 会限流或踢连接（表现就是"同步时好时坏"）。
 * 这里保证**同一账号**的同步排队执行；不同账号仍可并行。
 */
const chains = new Map<string, Promise<unknown>>();

export function withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(accountId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  // 链尾吞掉错误，避免一次失败把后续排队任务都变成 rejected
  chains.set(
    accountId,
    run.catch(() => undefined),
  );
  return run;
}

/** 当前是否已有该账号的同步在跑（界面用来避免重复点击）。 */
export function isSyncing(accountId: string): boolean {
  return chains.has(accountId);
}
