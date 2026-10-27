import { create } from "zustand";
import { errMsg } from "../../../lib/error";
import { connectFeishu, disconnectFeishu, getFeishuConnection } from "./feishuAuth";
import { inspectFeishuLink, readImportSource, saveFeishuProbe } from "./service";
import type { FeishuConnection, ReadProgress, SourceResolution, SourceSnapshot } from "./types";
import { useImportWorkflowStore } from "./workflowStore";
export { FEISHU_REDIRECT_URI, FEISHU_SCOPES } from "./feishuAuth";

type Phase = "idle" | "authorizing" | "resolving" | "reading" | "saving";
interface State {
  open: boolean;
  phase: Phase;
  connection: FeishuConnection | null;
  resolution: SourceResolution | null;
  snapshot: SourceSnapshot | null;
  progress: ReadProgress | null;
  error: string | null;
  notice: string | null;
  input: string;
  entireTable: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  setInput: (input: string) => void;
  setEntireTable: (value: boolean) => void;
  connect: (appId: string, secret: string) => Promise<void>;
  disconnect: () => Promise<void>;
  inspect: (selectedId?: string) => Promise<void>;
  read: () => Promise<void>;
  saveReport: () => Promise<void>;
  cancel: () => void;
}

let active: AbortController | null = null;

export const useJobImportStore = create<State>((set, get) => {
  const options = (controller: AbortController) => ({ signal: controller.signal,
    onProgress: (progress: ReadProgress) => { if (active === controller) set({ progress }); } });
  const run = async (phase: Phase, action: (controller: AbortController) => Promise<void>) => {
    if (get().phase !== "idle") return;
    const controller = new AbortController();
    active = controller;
    set({ phase, error: null, notice: null });
    try { await action(controller); }
    catch (error) { set({ error: controller.signal.aborted ? null : errMsg(error),
      notice: controller.signal.aborted ? "已取消，未写入投递记录" : null }); }
    finally { if (active === controller) { active = null; set({ phase: "idle", progress: null }); } }
  };
  return {
    open: false, phase: "idle", connection: null, resolution: null, snapshot: null,
    progress: null, error: null, notice: null, input: "", entireTable: false,
    openDialog: () => { set({ open: true, error: null }); void getFeishuConnection()
      .then((connection) => set({ connection })).catch((error) => set({ error: errMsg(error) })); },
    closeDialog: () => { if (get().phase === "idle" && useImportWorkflowStore.getState().phase === "idle") set({ open: false }); },
    setInput: (input) => { useImportWorkflowStore.getState().reset(); set({ input, resolution: null, snapshot: null, notice: null, error: null, entireTable: false }); },
    setEntireTable: (entireTable) => { useImportWorkflowStore.getState().reset(); set({ entireTable, snapshot: null }); },
    connect: (appId, secret) => run("authorizing", async (controller) => {
      const connection = await connectFeishu(appId, secret, controller.signal);
      set({ connection, resolution: null, snapshot: null, notice: "已连接飞书，可以开始检查链接" });
    }),
    disconnect: () => run("saving", async () => {
      await disconnectFeishu();
      set({ connection: null, resolution: null, snapshot: null, notice: "已清理飞书连接凭据" });
    }),
    inspect: (selectedId) => run("resolving", async (controller) => {
      const { connection, input } = get();
      if (!connection) throw new Error("请先连接飞书");
      set({ resolution: null, snapshot: null });
      useImportWorkflowStore.getState().reset();
      const resolution = await inspectFeishuLink(connection.id, input, options(controller), selectedId);
      if (!controller.signal.aborted) set({ resolution });
    }),
    read: () => run("reading", async (controller) => {
      const { resolution, entireTable } = get();
      if (!resolution?.source) throw new Error("请先选择并确认一个工作表或数据表");
      set({ snapshot: null });
      useImportWorkflowStore.getState().reset();
      const snapshot = await readImportSource(resolution.source, entireTable, options(controller));
      if (!controller.signal.aborted) {
        set({ snapshot, notice: `读取完成：${snapshot.fields.length} 个字段，${snapshot.rows.length} 行` });
        await useImportWorkflowStore.getState().initialize(snapshot);
      }
    }),
    saveReport: () => run("saving", async () => {
      const snapshot = get().snapshot;
      if (!snapshot) return;
      const path = await saveFeishuProbe(snapshot);
      if (path) set({ notice: `验证报告已保存到 ${path}` });
    }),
    cancel: () => active?.abort(),
  };
});
