import { create } from "zustand";
import { getDb } from "../kernel/db";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { scanKb, listKbDocs, indexFile, type KbDocRow } from "../modules/knowledge/ingest";

async function persistField(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value],
  );
}

async function readField(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

/** 知识库状态：根目录 / 文档列表 / 索引进度 / 选中文档 / 轮询。 */
interface KbState {
  open: boolean;
  rootPath: string | null;
  docs: KbDocRow[];
  indexing: boolean;
  indexMsg: string | null;
  lastIndexAt: number | null;
  selected: string | null;
  /** 预览/编辑内容缓存（path → content） */
  drafts: Record<string, string>;

  setOpen: (v: boolean) => void;
  load: () => Promise<void>;
  /** 选择文件夹 → 持久化 → 立即索引 */
  pickFolder: () => Promise<void>;
  /** 手动立即索引（静默轮询复用同一实现） */
  scan: (silent?: boolean) => Promise<void>;
  selectDoc: (path: string) => Promise<void>;
  /** 保存编辑后的文档并重新索引 */
  saveDoc: (path: string, content: string) => Promise<void>;
}

export const useKbStore = create<KbState>((set, get) => ({
  open: false,
  rootPath: null,
  docs: [],
  indexing: false,
  indexMsg: null,
  lastIndexAt: null,
  selected: null,
  drafts: {},

  setOpen: (open) => set({ open }),

  load: async () => {
    try {
      const rootPath = await readField("kb_root");
      const lastIndexAt = await readField("kb_last_index");
      const docs = await listKbDocs();
      set({
        rootPath,
        lastIndexAt: lastIndexAt ? Number(lastIndexAt) : null,
        docs,
      });
    } catch (e) {
      console.error("[kb] load failed", e);
    }
  },

  pickFolder: async () => {
    const picked = await open({ directory: true, multiple: false, title: "选择知识库文件夹" });
    if (typeof picked !== "string" || !picked) return;
    await persistField("kb_root", picked);
    set({ rootPath: picked, selected: null, drafts: {} });
    await get().scan();
  },

  scan: async (silent = false) => {
    const root = get().rootPath;
    if (!root || get().indexing) return;
    set({ indexing: true, indexMsg: null });
    try {
      const result = await scanKb(root, (f) => {
        if (!silent) set({ indexMsg: f });
      });
      const now = Date.now();
      await persistField("kb_last_index", String(now));
      set({
        docs: await listKbDocs(),
        lastIndexAt: now,
        indexMsg: null,
      });
      if (!silent && (result.indexed > 0 || result.removed > 0)) {
        console.log(`[kb] indexed ${result.indexed}, removed ${result.removed}, errors ${result.errors}`);
      }
    } catch (e) {
      console.error("[kb] scan failed", e);
    } finally {
      set({ indexing: false });
    }
  },

  selectDoc: async (path) => {
    const cur = get().drafts[path];
    if (cur === undefined) {
      const content = await readTextFile(path).catch(() => "");
      set((s) => ({ selected: path, drafts: { ...s.drafts, [path]: content } }));
    } else {
      set({ selected: path });
    }
  },

  saveDoc: async (path, content) => {
    await writeTextFile(path, content);
    await indexFile(path);
    set((s) => ({
      drafts: { ...s.drafts, [path]: content },
      docs: s.docs.map((d) => (d.path === path ? { ...d, index_status: "indexed" } : d)),
    }));
  },
}));
