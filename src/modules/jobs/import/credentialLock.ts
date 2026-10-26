import { invoke } from "@tauri-apps/api/core";

export async function withCredentialLock<T>(action: () => Promise<T>): Promise<T> {
  const lease = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, "0")).join("");
  await invoke("jobs_feishu_credentials_acquire", { lease });
  try { return await action(); }
  finally { await invoke("jobs_feishu_credentials_release", { lease }); }
}
