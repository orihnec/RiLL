import { create } from "zustand";
import { getDb } from "../../kernel/db";
import { CATEGORY_PALETTE, deriveCategoryColors } from "../../lib/colors";
import { reassignJobStatus } from "./service";

/** 求职状态定义（id 存进 job_applications.status，颜色/名称可自定义）。 */
export interface JobStatusDef {
  id: string;
  name: string;
  color: string;
  bar: string;
  from: string;
  to: string;
  text: string;
}

/** 内置默认状态（首次默认与「恢复默认」种子）。 */
const SEED: { id: string; name: string; color: string }[] = [
  { id: "preparing", name: "准备投递", color: "#fbbf24" },
  { id: "applied", name: "已投递", color: "#38bdf8" },
  { id: "interviewing", name: "面试中", color: "#818cf8" },
  { id: "offer", name: "Offer", color: "#34d399" },
  { id: "rejected", name: "已拒绝", color: "#fb7185" },
  { id: "archived", name: "已归档", color: "#94a3b8" },
];

export const DEFAULT_JOB_STATUSES: JobStatusDef[] = SEED.map((s) => ({
  ...s,
  ...deriveCategoryColors(s.color),
}));

/** 状态配色面板（与类别共用同一色板）。 */
export const JOB_STATUS_PALETTE = CATEGORY_PALETTE;

/* ---- 运行时状态表（渲染/工具统一从这里取名与配色；由 store 维护） ---- */
let STATUS_STATE: JobStatusDef[] = DEFAULT_JOB_STATUSES;

export function applyJobStatuses(list: JobStatusDef[]): void {
  STATUS_STATE = list.length > 0 ? list : DEFAULT_JOB_STATUSES;
}

export function jobStatusOf(id: string): JobStatusDef {
  return STATUS_STATE.find((s) => s.id === id) ?? STATUS_STATE[0] ?? DEFAULT_JOB_STATUSES[0];
}

export function jobStatusLabel(id: string): string {
  const s = STATUS_STATE.find((x) => x.id === id);
  return s ? s.name : id;
}

/** 解析用户/LLM 输入的状态：id 或中文名 → id；无法识别返回 null。 */
export function resolveJobStatusId(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const byId = STATUS_STATE.find((s) => s.id === v);
  if (byId) return byId.id;
  const lower = v.toLowerCase();
  const byName = STATUS_STATE.find((s) => s.name.toLowerCase() === lower);
  return byName ? byName.id : null;
}

const KEY = "job_statuses";

async function persist(list: JobStatusDef[]): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [KEY, JSON.stringify(list)],
  );
}

function sanitize(list: JobStatusDef[]): JobStatusDef[] {
  if (!Array.isArray(list) || list.length === 0) return DEFAULT_JOB_STATUSES;
  const out: JobStatusDef[] = [];
  for (const s of list) {
    if (!s || typeof s.id !== "string" || !s.name) continue;
    const base =
      typeof s.color === "string" && /^#?[0-9a-fA-F]{3,6}$/.test(s.color) ? s.color : "#94a3b8";
    out.push({ ...s, color: base, ...deriveCategoryColors(base) });
  }
  return out.length > 0 ? out : DEFAULT_JOB_STATUSES;
}

interface State {
  statuses: JobStatusDef[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (name: string, color: string) => Promise<JobStatusDef>;
  update: (id: string, patch: { name?: string; color?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  move: (id: string, dir: "up" | "down") => void;
  reset: () => Promise<void>;
}

export const useJobStatusStore = create<State>((set, get) => ({
  statuses: DEFAULT_JOB_STATUSES,
  loaded: false,

  load: async () => {
    try {
      const db = getDb();
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM app_settings WHERE key = $1",
        [KEY],
      );
      let list: JobStatusDef[];
      if (rows.length > 0) {
        try {
          list = sanitize(JSON.parse(rows[0].value) as JobStatusDef[]);
        } catch {
          list = DEFAULT_JOB_STATUSES;
        }
      } else {
        list = DEFAULT_JOB_STATUSES;
        void persist(list).catch(console.warn);
      }
      // 老库里没有新增的内置状态（如「准备投递」）→ 按默认顺序补进去，只补不改
      const missing = DEFAULT_JOB_STATUSES.filter((d) => !list.some((s) => s.id === d.id));
      if (missing.length > 0) {
        const merged = [...list];
        for (const d of missing) {
          const idx = DEFAULT_JOB_STATUSES.findIndex((x) => x.id === d.id);
          merged.splice(Math.min(idx, merged.length), 0, d);
        }
        list = merged;
        void persist(list).catch(console.warn);
      }
      applyJobStatuses(list);
      set({ statuses: list, loaded: true });
    } catch (e) {
      console.error("[jobStatus] load failed", e);
      applyJobStatuses(DEFAULT_JOB_STATUSES);
      set({ statuses: DEFAULT_JOB_STATUSES, loaded: true });
    }
  },

  add: async (name, color) => {
    const def: JobStatusDef = {
      id: crypto.randomUUID(),
      name: name.trim() || "新状态",
      color,
      ...deriveCategoryColors(color),
    };
    const list = [...get().statuses, def];
    applyJobStatuses(list);
    set({ statuses: list });
    void persist(list).catch(console.warn);
    return def;
  },

  update: async (id, patch) => {
    const list = get().statuses.map((s) => {
      if (s.id !== id) return s;
      const next: JobStatusDef = {
        ...s,
        name: patch.name !== undefined ? patch.name.trim() || s.name : s.name,
      };
      if (patch.color && patch.color !== s.color) {
        Object.assign(next, deriveCategoryColors(patch.color), { color: patch.color });
      }
      return next;
    });
    applyJobStatuses(list);
    set({ statuses: list });
    void persist(list).catch(console.warn);
  },

  remove: async (id) => {
    const current = get().statuses;
    if (current.length <= 1) return; // 至少保留一个状态
    if (!current.some((s) => s.id === id)) return;
    const fallback = current.find((s) => s.id !== id)!.id;
    await reassignJobStatus(id, fallback);
    const list = current.filter((s) => s.id !== id);
    applyJobStatuses(list);
    set({ statuses: list });
    void persist(list).catch(console.warn);
  },

  move: (id, dir) => {
    const list = [...get().statuses];
    const idx = list.findIndex((s) => s.id === id);
    const to = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || to < 0 || to >= list.length) return;
    [list[idx], list[to]] = [list[to], list[idx]];
    applyJobStatuses(list);
    set({ statuses: list });
    void persist(list).catch(console.warn);
  },

  reset: async () => {
    applyJobStatuses(DEFAULT_JOB_STATUSES);
    set({ statuses: DEFAULT_JOB_STATUSES });
    void persist(DEFAULT_JOB_STATUSES).catch(console.warn);
  },
}));
