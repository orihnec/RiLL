import { create } from "zustand";
import { isTauri } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

const origin = crypto.randomUUID();
export const useJobsVersion = create<{ version: number }>(() => ({ version: 0 }));
const bump = () => useJobsVersion.setState((state) => ({ version: state.version + 1 }));

export function notifyJobsChanged(): void {
  bump();
  if (isTauri()) void emit("jobs:changed", origin).catch(() => {
    // 写入已经成功；其他窗口在重新获得焦点时也会重新取数。
  });
}
if (isTauri()) void listen<string>("jobs:changed", (event) => { if (event.payload !== origin) bump(); });
