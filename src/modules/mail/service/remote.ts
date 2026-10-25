import { getAccount } from "./accounts";
import { getPassword } from "tauri-plugin-keyring-api";
import { invoke } from "@tauri-apps/api/core";
import { KEYRING_SERVICE, keyringUser } from "./consts";
import type { RustBody, RustConfig, RustHeaderBatch, RustProbe } from "./types";

export async function testConnection(cfg: {
  host: string;
  port: number;
  security: string;
  username: string;
  password: string;
}): Promise<RustProbe> {
  return invoke<RustProbe>("mail_test_account", { cfg });
}

export async function fetchHeaders(
  cfg: RustConfig,
  folder: string,
  sinceDays: number,
  limit: number,
  afterUid: number | null,
): Promise<RustHeaderBatch> {
  return invoke<RustHeaderBatch>("mail_sync_headers", {
    cfg,
    folder,
    sinceDays,
    limit,
    afterUid,
  });
}

export async function fetchBody(cfg: RustConfig, folder: string, uid: number): Promise<RustBody> {
  return invoke<RustBody>("mail_fetch_body", { cfg, folder, uid });
}

export async function saveAttachment(
  cfg: RustConfig,
  folder: string,
  uid: number,
  index: number,
  path: string,
): Promise<number> {
  return invoke<number>("mail_save_attachment", { cfg, folder, uid, index, path });
}

export async function setFlagsRemote(
  accountId: string,
  folderRaw: string,
  uids: number[],
  flags: { seen?: boolean; flagged?: boolean },
): Promise<void> {
  const cfg = await rustConfigOf(accountId);
  await invoke<number>("mail_set_flags", {
    cfg,
    folder: folderRaw,
    uids,
    seen: flags.seen ?? null,
    flagged: flags.flagged ?? null,
  });
}

export async function moveRemote(
  accountId: string,
  folderRaw: string,
  uids: number[],
  targetRaw: string,
): Promise<void> {
  const cfg = await rustConfigOf(accountId);
  await invoke<number>("mail_move", { cfg, folder: folderRaw, uids, target: targetRaw });
}

export async function rustConfigOf(accountId: string): Promise<RustConfig> {
  const account = await getAccount(accountId);
  if (!account) throw new Error("账号不存在");
  const password = await getPassword(KEYRING_SERVICE, keyringUser(accountId)).catch(() => null);
  if (!password) throw new Error("钥匙串里没有该账号的授权码，请重新添加账号");
  return {
    host: account.host,
    port: account.port,
    security: account.security,
    username: account.username,
    password,
  };
}
