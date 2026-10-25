import { create } from "zustand";
import { getDb } from "../kernel/db";
import {
  CATEGORIES,
  applyCategories,
  deriveCategoryColors,
  type Category,
} from "../lib/colors";
import { reassignCategory } from "../modules/calendar/service";
import { useCalendarStore } from "./calendarStore";

const CATEGORY_KEY = "categories";

async function persistCategories(list: Category[]): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [CATEGORY_KEY, JSON.stringify(list)],
  );
}

function sanitize(list: Category[]): Category[] {
  if (!Array.isArray(list) || list.length === 0) return CATEGORIES;
  const out: Category[] = [];
  for (const c of list) {
    if (!c || typeof c.id !== "string" || !c.name) continue;
    const base = typeof c.color === "string" && /^#?[0-9a-fA-F]{3,6}$/.test(c.color) ? c.color : "#94a3b8";
    out.push({ ...c, color: base, ...deriveCategoryColors(base) });
  }
  return out.length > 0 ? out : CATEGORIES;
}

interface CategoryState {
  categories: Category[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (name: string, color: string) => Promise<Category>;
  update: (id: string, patch: { name?: string; color?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  move: (id: string, dir: "up" | "down") => void;
  reset: () => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: CATEGORIES,
  loaded: false,

  load: async () => {
    try {
      const db = getDb();
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM app_settings WHERE key = $1",
        [CATEGORY_KEY],
      );
      let list: Category[];
      if (rows.length > 0) {
        try {
          list = sanitize(JSON.parse(rows[0].value) as Category[]);
        } catch {
          list = CATEGORIES;
        }
      } else {
        list = CATEGORIES;
        void persistCategories(list).catch(console.warn);
      }
      applyCategories(list);
      set({ categories: list, loaded: true });
    } catch (e) {
      console.error("[category] load failed", e);
      applyCategories(CATEGORIES);
      set({ categories: CATEGORIES, loaded: true });
    }
  },

  add: async (name, color) => {
    const cat: Category = { id: crypto.randomUUID(), name: name.trim() || "新类别", color, ...deriveCategoryColors(color) };
    const list = [...get().categories, cat];
    applyCategories(list);
    set({ categories: list });
    void persistCategories(list).catch(console.warn);
    return cat;
  },

  update: async (id, patch) => {
    let colorChanged = false;
    const list = get().categories.map((c) => {
      if (c.id !== id) return c;
      const next: Category = {
        ...c,
        name: patch.name !== undefined ? patch.name.trim() || c.name : c.name,
      };
      if (patch.color && patch.color !== c.color) {
        const colors = deriveCategoryColors(patch.color);
        Object.assign(next, colors, { color: patch.color });
        colorChanged = true;
      }
      return next;
    });
    applyCategories(list);
    set({ categories: list });
    void persistCategories(list).catch(console.warn);
    if (colorChanged) void useCalendarStore.getState().reload();
  },

  remove: async (id) => {
    const current = get().categories;
    if (current.length <= 1) return; // 至少保留一个类别
    if (!current.some((c) => c.id === id)) return;
    await reassignCategory(id, "default");
    const list = current.filter((c) => c.id !== id);
    applyCategories(list);
    set({ categories: list });
    void persistCategories(list).catch(console.warn);
    void useCalendarStore.getState().reload();
  },

  move: (id, dir) => {
    const list = [...get().categories];
    const idx = list.findIndex((c) => c.id === id);
    const to = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || to < 0 || to >= list.length) return;
    [list[idx], list[to]] = [list[to], list[idx]];
    applyCategories(list);
    set({ categories: list });
    void persistCategories(list).catch(console.warn);
  },

  reset: async () => {
    applyCategories(CATEGORIES);
    set({ categories: CATEGORIES });
    void persistCategories(CATEGORIES).catch(console.warn);
    void useCalendarStore.getState().reload();
  },
}));
