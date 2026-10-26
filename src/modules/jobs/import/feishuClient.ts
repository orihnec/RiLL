import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getFeishuAccessToken } from "./feishuAuth";
import { buildApiUrl, checkCanceled, FeishuApiError, readApi } from "./transport";
import type { FeishuRequest, ReadOptions } from "./types";

export function createFeishuClient(options: ReadOptions): { request: FeishuRequest; close: () => void; progress: (stage: string, records: number) => void } {
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal.reason);
  options.signal.addEventListener("abort", cancel, { once: true });
  if (options.signal.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new Error("读取超过 5 分钟，请缩小来源范围后重试")), 300_000);
  let requests = 0;
  const progress = (stage: string, records: number) => options.onProgress?.({ stage, records, requests });
  const request: FeishuRequest = async <T>(path: string, query?: Record<string, string>) => {
    checkCanceled(controller.signal);
    const url = buildApiUrl(path, query);
    const token = await getFeishuAccessToken();
    requests++;
    try { return await readApi<T>(tauriFetch, url, token, controller.signal); }
    catch (error) {
      if (!(error instanceof FeishuApiError) || ![99991663, 99991668, 99991677].includes(error.code)) throw error;
      const refreshed = await getFeishuAccessToken(true, token);
      requests++;
      return readApi<T>(tauriFetch, url, refreshed, controller.signal);
    }
  };
  return { request, progress, close: () => { clearTimeout(timer); options.signal.removeEventListener("abort", cancel); } };
}
