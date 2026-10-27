export type Fetch = (input: string, init: RequestInit & { maxRedirections?: number; connectTimeout?: number }) => Promise<Response>;

const ORIGIN = "https://open.feishu.cn";
const TOKEN_URL = "https://accounts.feishu.cn/oauth/v3/token";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class FeishuApiError extends Error {
  constructor(public status: number, public code: number, public requestId: string) {
    const detail = code === 99991672 ? "应用尚未开通所需的只读权限，请在飞书后台配置后重新授权" :
      [99991661, 99991663, 99991668, 99991677].includes(code) || status === 401 ? "飞书授权已失效，请重新连接" :
      status === 403 || code === 99991679 ? "当前用户或应用没有读取这份文档的权限" :
      code === 1254040 ? "未找到多维表格资源，请核对内嵌表的实际资源标识" :
      status === 429 ? "飞书请求过于频繁，请稍后重试" : "飞书请求失败";
    super(`${detail}（HTTP ${status}，错误码 ${code}${requestId ? `，请求 ${requestId}` : ""}）`);
  }
}

function abortError(): DOMException { return new DOMException("已取消", "AbortError"); }

export function checkCanceled(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? abortError();
}

async function pause(ms: number, signal: AbortSignal): Promise<void> {
  checkCanceled(signal);
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(signal.reason ?? abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function retryDelay(header: string | null, attempt: number): number {
  if (header) {
    const seconds = Number(header);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
    if (Number.isFinite(delay)) return Math.min(120_000, Math.max(0, delay));
  }
  return Math.min(8000, 500 * 2 ** attempt);
}

export function buildApiUrl(path: string, query: Record<string, string> = {}): string {
  if (!/^\/open-apis\/(sheets|bitable)\//.test(path) || path.includes("..") || /[?#\\]/.test(path)) {
    throw new Error("禁止向非飞书表格接口发送授权信息");
  }
  const url = new URL(path, ORIGIN);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.href;
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_RESPONSE_BYTES) throw new Error("飞书单次响应超过 8 MiB，请缩小读取范围");
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("飞书单次响应过大，请缩小读取范围"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new Error("飞书返回了无法解析的数据，请检查网络或稍后重试"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("飞书响应格式不正确");
  return body as Record<string, unknown>;
}

function apiError(response: Response, body: Record<string, unknown>): FeishuApiError {
  const error = body.error as { log_id?: string } | undefined;
  const id = response.headers.get("x-tt-logid") || error?.log_id || "";
  return new FeishuApiError(response.status, Number(body.code ?? -1), /^[\w-]{1,100}$/.test(id) ? id : "");
}

class NetworkError extends Error {}

async function timedJson(fetcher: Fetch, url: string, init: RequestInit, signal: AbortSignal): Promise<{ response: Response; body: Record<string, unknown> }> {
  checkCanceled(signal);
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new NetworkError("飞书请求超时，请重试")), 25_000);
  let rejectAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason ?? abortError());
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  const request = async () => {
    let response: Response;
    try { response = await fetcher(url, { ...init, signal: controller.signal, redirect: "error", maxRedirections: 0, connectTimeout: 10_000 }); }
    catch { checkCanceled(controller.signal); throw new NetworkError("无法连接飞书"); }
    if (response.status === 429 || response.status >= 500) { await response.body?.cancel(); return { response, body: {} }; }
    const body = await jsonBody(response).catch((error: unknown) => { if (!response.ok) return {}; throw error; });
    return { response, body };
  };
  try { return await Promise.race([request(), aborted]); }
  finally {
    clearTimeout(timer); signal.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}

export async function readApi<T>(fetcher: Fetch, url: string, token: string, signal: AbortSignal): Promise<T> {
  if (new URL(url).origin !== ORIGIN || !new URL(url).pathname.startsWith("/open-apis/")) throw new Error("飞书请求地址无效");
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    let body: Record<string, unknown>;
    try { ({ response, body } = await timedJson(fetcher, url, { headers: { Authorization: `Bearer ${token}` } }, signal)); }
    catch (error) {
      checkCanceled(signal);
      if (!(error instanceof NetworkError)) throw error;
      if (attempt >= 2) throw new Error("无法连接飞书，请检查网络后重试");
      await pause(retryDelay(null, attempt), signal); continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await pause(retryDelay(response.headers.get("retry-after"), attempt), signal); continue;
    }
    if (!response.ok || Number(body.code) !== 0) throw apiError(response, body);
    if (!body.data || typeof body.data !== "object") throw new Error("飞书响应缺少数据，无法确认读取完整性");
    return body.data as T;
  }
}

export async function exchangeToken(fetcher: Fetch, payload: Record<string, string>, signal: AbortSignal): Promise<Record<string, unknown>> {
  let response: Response;
  let body: Record<string, unknown>;
  try { ({ response, body } = await timedJson(fetcher, TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }, signal)); } catch {
    checkCanceled(signal);
    throw new Error("授权凭据交换未完成，请重新连接飞书（不自动重放一次性授权码）");
  }
  if (!response.ok || body.error || (body.code !== undefined && Number(body.code) !== 0)) throw apiError(response, body);
  return body;
}
