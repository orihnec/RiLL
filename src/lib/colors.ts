/** 事件类别 = 颜色。低饱和渐变 + 左侧色条。基准色 color 是唯一来源，其余由它推导。 */
export interface Category {
  id: string;
  name: string;
  /** 基准色（可自选，hex），用户在此之上调整颜色 */
  color: string;
  /** 左侧色条颜色（由 color 推导，偏亮） */
  bar: string;
  /** 卡片渐变（深底低饱和，由 color 推导） */
  from: string;
  to: string;
  /** 文字颜色（由 color 推导，偏亮） */
  text: string;
}

/** 内置 8 类（作为首次默认与「恢复默认」种子）。 */
export const CATEGORIES: Category[] = [
  { id: "default", name: "默认", color: "#94a3b8" },
  { id: "work", name: "工作", color: "#818cf8" },
  { id: "meeting", name: "会议", color: "#38bdf8" },
  { id: "focus", name: "专注", color: "#a78bfa" },
  { id: "personal", name: "个人", color: "#2dd4bf" },
  { id: "health", name: "健康", color: "#34d399" },
  { id: "travel", name: "出行", color: "#fbbf24" },
  { id: "important", name: "重要", color: "#fb7185" },
].map((c) => ({ ...c, ...deriveCategoryColors(c.color) }));

/** 自选颜色面板：常用低饱和色板。 */
export const CATEGORY_PALETTE = [
  "#94a3b8",
  "#818cf8",
  "#38bdf8",
  "#a78bfa",
  "#2dd4bf",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#f472b6",
  "#22c55e",
  "#f97316",
  "#eab308",
  "#06b6d4",
  "#8b5cf6",
  "#ef4444",
  "#64748b",
];

/* ---- 运行时类别列表（由 categoryStore 维护；渲染统一从这里取色） ---- */
let CATEGORY_STATE: Category[] = CATEGORIES;

/** 供 categoryStore 在加载/增删改后同步全局（不触发订阅，仅为 categoryOf 取色）。 */
export function applyCategories(list: Category[]): void {
  CATEGORY_STATE = list.length > 0 ? list : CATEGORIES;
}

export function categoryOf(id: string): Category {
  return CATEGORY_STATE.find((c) => c.id === id) ?? CATEGORY_STATE[0] ?? CATEGORIES[0];
}

/* ---- 工具：hex → 推导色系 ---- */

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h || "94a3b8", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 把 a 向 b 混入 t（0-1），返回 round。 */
function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function hex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 由基准色推导整组着色。
 *
 * 深色系 / 浅色系必须分开处理：文字不能写死"向白色混亮"，否则浅色主题下
 * 会变成白底白字（曾出现的 bug）。这里改用 `color-mix` + 主题变量：
 * - `--color-white`：深色系=白、浅色系=墨（主题面板维护）
 * - `--tint-text`  ：文字里基色的占比（深色系 22% 偏亮 / 浅色系 50% 偏深）
 * - `--tint-from`/`--tint-to`：卡片渐变底色浓度（浅色系略浓一点才不发灰）
 * `bar` 保持纯 hex（调用方会做 `${bar}55` 这类透明度拼接）。
 */
export function deriveCategoryColors(base: string): {
  bar: string;
  from: string;
  to: string;
  text: string;
} {
  const [r, g, b] = hexToRgb(base);
  const solid = hex([r, g, b]);
  return {
    bar: hex([mix(r, 255, 0.35), mix(g, 255, 0.35), mix(b, 255, 0.35)]),
    from: `color-mix(in oklab, ${solid} var(--tint-from, 18%), transparent)`,
    to: `color-mix(in oklab, ${solid} var(--tint-to, 6%), transparent)`,
    text: `color-mix(in oklab, ${solid} var(--tint-text, 22%), var(--color-white, #ffffff))`,
  };
}
