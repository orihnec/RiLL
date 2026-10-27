import { fingerprint } from "./fingerprint";

export interface SecretStorage {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}
interface Generation { id: string; parts: number; digest: string; }
interface Manifest { version: 2; active: Generation | null; retired: Generation[]; }
// Windows 的上限是 UTF-16 编码后的 2560 字节，保留余量并避免拆开代理对。
const CHUNK_UNITS = 1000;
const MAX_UNITS = 128_000;

function manifest(raw: string | null): Manifest | null {
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("飞书凭据索引损坏，请重新连接"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("飞书凭据索引无效，请重新连接");
  const data = value as Partial<Manifest>;
  if (data.version !== 2) return null;
  const valid = (g: Generation) => g && /^[\w-]{1,50}$/.test(g.id) && Number.isInteger(g.parts) &&
    g.parts > 0 && g.parts <= 256 && /^[a-f0-9]{64}$/.test(g.digest);
  if ((data.active !== null && !valid(data.active!)) || !Array.isArray(data.retired) || !data.retired.every(valid)) {
    throw new Error("飞书凭据索引无效，请清理连接后重试");
  }
  return data as Manifest;
}

function chunks(raw: string): string[] {
  if (raw.length > MAX_UNITS) throw new Error("飞书凭据超过本机安全存储上限");
  const result: string[] = [];
  let part = "";
  for (const char of raw) {
    if (part.length + char.length > CHUNK_UNITS) { result.push(part); part = ""; }
    part += char;
  }
  if (part) result.push(part);
  return result;
}

export function createCredentialVault(storage: SecretStorage, account: string) {
  const key = (g: Generation, index: number) => `${account}:v2:${g.id}:${index}`;
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(action: () => Promise<T>): Promise<T> => {
    const task = queue.then(action, action);
    queue = task.catch(() => undefined);
    return task;
  };
  const clean = async (generations: Generation[]): Promise<Generation[]> => {
    const remaining: Generation[] = [];
    for (const g of generations) {
      let failed = false;
      for (let i = 0; i < g.parts; i++) {
        try { await storage.remove(key(g, i)); } catch { failed = true; }
      }
      if (failed) remaining.push(g);
    }
    return remaining;
  };
  const read = async (): Promise<string | null> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = await storage.get(account);
      const index = manifest(raw);
      if (!index) return raw;
      if (!index.active) return null;
      const parts = await Promise.all(Array.from({ length: index.active.parts }, (_, i) => storage.get(key(index.active!, i))));
      const joined = parts.join("");
      if (parts.every((p) => p !== null) && await fingerprint(joined) === index.active.digest) return joined;
      if (await storage.get(account) === raw) throw new Error("飞书安全凭据分段缺失或校验失败，请重新连接");
    }
    throw new Error("飞书凭据正在更新，请稍后重试");
  };
  const write = (raw: string): Promise<void> => exclusive(async () => {
    const old = manifest(await storage.get(account));
    const previousRetired = await clean(old?.retired || []);
    if (previousRetired.length > 3) throw new Error("旧飞书凭据尚未清理，请先断开连接");
    const parts = chunks(raw);
    const active = { id: crypto.randomUUID(), parts: parts.length, digest: await fingerprint(raw) };
    let written = 0;
    try {
      for (const part of parts) { await storage.set(key(active, written), part); written++; }
      // 最后切换一个小索引；分段写入失败时保留上一套完整凭据。
      const retired = [...previousRetired, ...(old?.active ? [old.active] : [])];
      await storage.set(account, JSON.stringify({ version: 2, active, retired }));
      const remaining = await clean(retired);
      // 清理失败的引用保留在索引中，下次轮换或断开时继续清理。
      if (remaining.length !== retired.length) {
        try { await storage.set(account, JSON.stringify({ version: 2, active, retired: remaining })); } catch { /* 已提交的索引仍然有效 */ }
      }
    } catch {
      // IPC 响应丢失时，索引可能已经提交，不能把仍被引用的新分段删掉。
      let current: string | null;
      try { current = await storage.get(account); } catch { throw new Error("无法确认飞书凭据保存结果，请重新打开连接检查"); }
      if (manifest(current)?.active?.id === active.id) return;
      await clean([{ ...active, parts: written }]);
      throw new Error("无法保存飞书安全凭据，请检查系统凭据管理器后重试");
    }
  });
  const clear = (): Promise<void> => exclusive(async () => {
    const raw = await storage.get(account);
    if (!raw) return;
    const old = manifest(raw);
    if (!old) { await storage.remove(account); return; }
    const retired = [...old.retired, ...(old.active ? [old.active] : [])];
    await storage.set(account, JSON.stringify({ version: 2, active: null, retired }));
    const remaining = await clean(retired);
    if (remaining.length) {
      await storage.set(account, JSON.stringify({ version: 2, active: null, retired: remaining }));
      throw new Error("连接已失效，部分旧凭据尚未清理，请再次断开连接");
    }
    await storage.remove(account);
  });
  return { read, write, clear };
}
