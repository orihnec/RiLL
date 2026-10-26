import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { openUrl } from "@tauri-apps/plugin-opener";
import { feishuCredentialStore } from "./credentialStore";
import { withCredentialLock } from "./credentialLock";
import { fingerprint } from "./fingerprint";
import { checkCanceled, exchangeToken, readApi } from "./transport";
import type { FeishuConnection } from "./types";

export const FEISHU_REDIRECT_URI = "http://127.0.0.1:43829/feishu/callback";
export const FEISHU_SCOPES = "sheets:spreadsheet:readonly bitable:app:readonly offline_access";

interface Credentials extends FeishuConnection {
  secret: string;
  accessToken: string;
  expiresAt: number;
  refreshToken: string | null;
  refreshExpiresAt: number | null;
}

let refreshTask: Promise<Credentials> | null = null;
let connecting = false;
let generation = 0;

async function credentials(): Promise<Credentials | null> {
  const raw = await feishuCredentialStore.read();
  if (!raw) return null;
  let value: Credentials;
  try { value = JSON.parse(raw) as Credentials; } catch { throw new Error("飞书连接凭据损坏，请断开后重新连接"); }
  if (!value.id || !value.appId || !value.userId || !value.secret || !value.accessToken || !Number.isFinite(value.expiresAt)) {
    throw new Error("飞书连接凭据不完整，请重新连接");
  }
  return value;
}

export async function getFeishuConnection(): Promise<FeishuConnection | null> {
  const value = await withCredentialLock(credentials);
  return value ? connectionInfo(value) : null;
}

function connectionInfo(value: Credentials): FeishuConnection {
  return { id: value.id, appId: value.appId, userId: value.userId, userName: value.userName,
    scope: value.scope, connectedAt: value.connectedAt };
}

function tokenCredentials(base: Pick<Credentials, "id" | "appId" | "secret" | "connectedAt" | "userId" | "userName">,
  token: Record<string, unknown>): Credentials {
  if (typeof token.access_token !== "string" || !token.access_token ||
      typeof token.expires_in !== "number" || !Number.isFinite(token.expires_in) || token.expires_in <= 0) {
    throw new Error("飞书授权响应缺少有效凭据，请重新授权");
  }
  return { ...base, accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000,
    refreshToken: typeof token.refresh_token === "string" ? token.refresh_token : null,
    refreshExpiresAt: typeof token.refresh_token_expires_in === "number" ? Date.now() + token.refresh_token_expires_in * 1000 : null,
    scope: typeof token.scope === "string" ? token.scope : "" };
}

export function buildAuthorizeUrl(appId: string, state: string): string {
  const url = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
  Object.entries({ client_id: appId, response_type: "code", redirect_uri: FEISHU_REDIRECT_URI,
    scope: FEISHU_SCOPES, prompt: "consent", state }).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.href;
}

export async function connectFeishu(appId: string, secret: string, signal: AbortSignal): Promise<FeishuConnection> {
  if (connecting || refreshTask) throw new Error("正在处理飞书授权，请稍后重试");
  if (!/^cli_[A-Za-z0-9]{8,80}$/.test(appId.trim()) || !secret.trim()) throw new Error("请填写有效的 App ID 和 App Secret");
  checkCanceled(signal);
  connecting = true;
  const epoch = ++generation;
  const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, "0")).join("");
  const cancel = () => { void invoke("jobs_feishu_cancel_callback", { state }).catch(() => undefined); };
  try {
    await invoke("jobs_feishu_start_callback", { state });
    signal.addEventListener("abort", cancel, { once: true });
    checkCanceled(signal);
    const waiting = invoke<string>("jobs_feishu_wait_callback", { state });
    void waiting.catch(() => undefined);
    // 先建立等待，再打开浏览器；即使回调很快也不会丢失授权码。
    try { await openUrl(buildAuthorizeUrl(appId.trim(), state)); }
    catch { cancel(); await waiting.catch(() => undefined); throw new Error("无法打开授权页面，请检查系统默认浏览器"); }
    const code = await waiting;
    checkCanceled(signal);
    const token = await exchangeToken(tauriFetch, { grant_type: "authorization_code", client_id: appId.trim(),
      client_secret: secret.trim(), code, redirect_uri: FEISHU_REDIRECT_URI }, signal);
    if (typeof token.access_token !== "string") throw new Error("飞书未返回有效的用户凭据");
    const user = await readApi<{ open_id?: string; name?: string }>(tauriFetch,
      "https://open.feishu.cn/open-apis/authen/v1/user_info", token.access_token, signal);
    if (!user.open_id) throw new Error("未能确认飞书用户身份，请重新授权");
    const id = await fingerprint({ provider: "feishu", appId: appId.trim(), userId: user.open_id });
    const value = tokenCredentials({ id,
      appId: appId.trim(), secret: secret.trim(), userId: user.open_id, userName: user.name || "飞书用户", connectedAt: Date.now() }, token);
    checkCanceled(signal);
    if (epoch !== generation) throw new Error("飞书连接已取消");
    await withCredentialLock(async () => {
      if (epoch !== generation) throw new Error("飞书连接已取消");
      await feishuCredentialStore.write(JSON.stringify(value));
    });
    return connectionInfo(value);
  } finally { connecting = false; signal.removeEventListener("abort", cancel); cancel(); }
}

async function refreshCredentials(forceRefresh: boolean, failedToken?: string): Promise<Credentials> {
  return withCredentialLock(async () => {
  const epoch = generation;
  const value = await credentials();
  if (value && ((!forceRefresh && value.expiresAt > Date.now() + 60_000) || (failedToken && value.accessToken !== failedToken))) return value;
  if (!value?.refreshToken || (value.refreshExpiresAt !== null && value.refreshExpiresAt <= Date.now())) {
    throw new Error("飞书长期授权已到期或未授予 offline_access，请重新连接");
  }
  const controller = new AbortController();
  const token = await exchangeToken(tauriFetch, { grant_type: "refresh_token", client_id: value.appId,
    client_secret: value.secret, refresh_token: value.refreshToken }, controller.signal);
  const next = tokenCredentials(value, token);
  if (!next.refreshToken) throw new Error("飞书未返回轮换后的刷新凭据，请重新授权");
  if (epoch !== generation) throw new Error("飞书连接已断开");
  await feishuCredentialStore.write(JSON.stringify(next));
  return next;
  });
}

export async function getFeishuAccessToken(forceRefresh = false, failedToken?: string): Promise<string> {
  const value = await withCredentialLock(credentials);
  if (!value) throw new Error("请先连接飞书");
  if (!forceRefresh && value.expiresAt > Date.now() + 60_000) return value.accessToken;
  // 单个连接只进行一次轮换，避免同一刷新令牌被并发使用。
  if (!refreshTask) refreshTask = refreshCredentials(forceRefresh, failedToken).finally(() => { refreshTask = null; });
  return (await refreshTask).accessToken;
}

export async function disconnectFeishu(): Promise<void> {
  if (connecting) throw new Error("请先取消正在进行的授权");
  generation++;
  if (refreshTask) await refreshTask.catch(() => undefined);
  await withCredentialLock(() => feishuCredentialStore.clear());
}
