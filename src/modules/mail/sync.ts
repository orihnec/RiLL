import {
  fetchHeaders,
  folderCounts,
  getAccount,
  getFolder,
  listAccounts,
  prefetchBodies,
  recomputeThreads,
  resetFolderMessages,
  rustConfigOf,
  setAccountSyncResult,
  testConnection,
  updateFolderStats,
  upsertFolders,
  upsertHeaders,
  type MailFolder,
} from "./service";
import { errMsg } from "../../lib/error";
import { withAccountLock } from "./syncQueue";

/**
 * 同步编排：探测文件夹 → 增量拉邮件头 → 落库 → 更新统计。
 *
 * 增量策略：每个文件夹存 `last_uid` 游标（配合 `uid_validity` 判断服务器是否重置过 UID）。
 * 首次同步按账号的 `sync_days` 回溯、最多 `sync_limit` 封，避免一上来就拉几千封。
 */

export interface SyncProgress {
  phase: "probe" | "messages" | "done";
  message: string;
  done?: number;
  total?: number;
}

export interface SyncResult {
  folders: number;
  added: number;
  folderName: string;
}

/** 探测并刷新文件夹列表（打开面板/账号按钮时用，只读列表，不拉邮件）。 */
export async function refreshFolders(accountId: string): Promise<MailFolder[]> {
  const cfg = await rustConfigOf(accountId);
  const probe = await testConnection(cfg);
  return upsertFolders(accountId, probe.folders);
}

/**
 * 同步一个文件夹的邮件头（不传 folderId 则同步收件箱）。
 *
 * 走 `withAccountLock`：同一账号的同步串行排队，避免界面/后台/实时监听三条链路
 * 同时开连接（163/QQ 会限流或踢连接）。
 */
export async function syncFolder(
  accountId: string,
  folderId?: string,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  return withAccountLock(accountId, () => syncFolderUnlocked(accountId, folderId, onProgress));
}

async function syncFolderUnlocked(
  accountId: string,
  folderId?: string,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const account = await getAccount(accountId);
  if (!account) throw new Error("账号不存在");

  try {
    const cfg = await rustConfigOf(accountId);
    onProgress?.({ phase: "probe", message: "正在连接并读取文件夹…" });
    const probe = await testConnection(cfg);
    const folders = await upsertFolders(accountId, probe.folders);

    const target =
      (folderId ? folders.find((f) => f.id === folderId) : undefined) ??
      folders.find((f) => f.special === "inbox") ??
      folders[0];
    if (!target) throw new Error("没有可同步的文件夹（IMAP 未返回收件箱）");

    onProgress?.({
      phase: "messages",
      message: `正在同步「${target.name}」（增量）…`,
      done: 0,
      total: 0,
    });

    // afterUid = 本地最大 UID → 只拉更新的；为 null 时按 sync_days 回溯
    const batch = await fetchHeaders(
      cfg,
      target.raw,
      account.syncDays,
      account.syncLimit,
      target.lastUid > 0 ? target.lastUid : null,
    );

    // UIDVALIDITY 变化 = 服务器重置过 UID，本地游标失效 → 清空重来
    if (batch.uidValidity && target.uidValidity && batch.uidValidity !== target.uidValidity) {
      await resetFolderMessages(target.id);
      target.lastUid = 0;
    }

    const stats = await upsertHeaders(accountId, target.id, batch.headers);
    const added = stats.added;
    // 会话（线索）合并：**每次同步都重算**，不能只在"有新邮件"时算 ——
    // 老数据是在 thread_id 列存在之前同步的，若这里走"没新邮件就不算"，
    // 那些邮件永远没有会话，列表会把每封邮件当成独立会话（踩过的坑）。
    // recomputeThreads 是纯函数且只 UPDATE 变化的行，代价可以接受。
    await recomputeThreads(target.id);
    const maxUid = batch.headers.reduce((m, h) => Math.max(m, h.uid), target.lastUid);
    const counts = await folderCounts(target.id);
    await updateFolderStats(target.id, {
      uidValidity: batch.uidValidity || target.uidValidity,
      lastUid: maxUid,
      total: counts.total,
      // 未读数**只信本地**：邮件头的 FLAGS 里带 `\Seen`，本地 seen 就是真相。
      // 之前用服务器的 SEARCH UNSEEN 覆盖，163/QQ 返回不规范时会把 762 写进未读数，
      // 而读信只改本地 → 界面永远 99+（踩过的坑）。
      unread: counts.unread,
    });
    await setAccountSyncResult(accountId, null);

    onProgress?.({
      phase: "done",
      message: added > 0 ? `「${target.name}」新增 ${added} 封` : `「${target.name}」已是最新`,
      done: added,
      total: added,
    });

    // 后台补几封正文：列表摘要、全文检索、后续 AI 提取都要正文（失败不影响同步结果）
    void prefetchBodies(accountId, target.id, 6).catch(() => undefined);

    return { folders: folders.length, added, folderName: target.name };
  } catch (e) {
    const msg = errMsg(e);
    await setAccountSyncResult(accountId, msg).catch(() => undefined);
    throw e;
  }
}

/**
 * 重建某个文件夹的会话：**重新拉一遍邮件头**（补上老数据缺的 References / In-Reply-To），
 * 再重算会话。用于 M1 时期同步进来的邮件（那时这些列还不存在），
 * 只靠"主题 + 参与者"兜底合并，准确性不如真正的线索链。
 */
export async function rebuildThreads(
  accountId: string,
  folderId: string,
  onProgress?: (p: SyncProgress) => void,
): Promise<number> {
  return withAccountLock(accountId, () => rebuildThreadsUnlocked(accountId, folderId, onProgress));
}

async function rebuildThreadsUnlocked(
  accountId: string,
  folderId: string,
  onProgress?: (p: SyncProgress) => void,
): Promise<number> {
  const account = await getAccount(accountId);
  if (!account) throw new Error("账号不存在");
  const folder = await getFolder(folderId);
  if (!folder) throw new Error("文件夹不存在");
  const cfg = await rustConfigOf(accountId);

  onProgress?.({ phase: "messages", message: "重新读取邮件头（补线索字段）…", done: 0, total: 0 });
  const batch = await fetchHeaders(
    cfg,
    folder.raw,
    Math.max(account.syncDays, 90),
    account.syncLimit,
    null,
  );
  await upsertHeaders(accountId, folderId, batch.headers);
  const updated = await recomputeThreads(folderId);
  const counts = await folderCounts(folderId);
  await updateFolderStats(folderId, { total: counts.total, unread: counts.unread });
  onProgress?.({ phase: "done", message: `会话已重建（${batch.headers.length} 封邮件头）`, done: 0, total: 0 });
  return updated;
}

/** 全部账号依次同步（「全部同步」；单个账号失败不影响其它账号）。 */export async function syncAllAccounts(
  onProgress?: (accountId: string, name: string, p: SyncProgress) => void,
): Promise<{ ok: number; failed: { account: string; error: string }[] }> {
  const accounts = (await listAccounts()).filter((a) => a.enabled);
  let ok = 0;
  const failed: { account: string; error: string }[] = [];
  for (const a of accounts) {
    const name = a.displayName ?? a.email;
    try {
      await syncFolder(a.id, undefined, (p) => onProgress?.(a.id, name, p));
      ok++;
    } catch (e) {
      failed.push({ account: name, error: errMsg(e) });
    }
  }
  return { ok, failed };
}
