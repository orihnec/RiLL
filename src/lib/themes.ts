/**
 * 主题与风格定义 + CSS 变量生成（支持深色系 / 浅色系 / 自定义颜色）。
 *
 * 换色原理（两个 Tailwind v4 的变量钩子）：
 * 1. `--color-indigo-*`：工具类 `bg-indigo-400/15`、`text-indigo-300`… 引用的是
 *    `color-mix(in oklab, var(--color-indigo-400) …)`，覆盖这一条色阶即全站强调色换掉。
 * 2. `--color-white`：全站的"表面叠加"（`bg-white/3`、`border-white/8`、`hover:bg-white/8`…）
 *    同样编译成 `color-mix(in oklab, var(--color-white) N%, transparent)`。
 *    深色系里它是白（提亮），**浅色系里改成墨色就变成压暗** —— 这是浅色主题能成立的关键，
 *    否则上百处 `bg-white/N` 会在浅底上直接消失。
 */

export type ThemeMode = "dark" | "light";

export interface AccentTheme {
  id: string;
  name: string;
  /** OKLCH 色相角（0-360） */
  hue: number;
  /** 饱和度系数：1 = 标准，<1 更中性 */
  chroma?: number;
}

export interface BackgroundTheme {
  id: string;
  name: string;
  mode: ThemeMode;
  /** 底色 */
  color: string;
  /** 环境光渐变；"accent" = 跟随主题色 */
  image: string | "accent";
}

export interface RadiusTheme {
  id: string;
  name: string;
  radius: string;
}

export interface ThemeConfig {
  /** 预设 id 或 "custom" */
  accent: string;
  /** accent === "custom" 时使用（#rrggbb） */
  accentHex: string;
  /** 预设 id 或 "custom" */
  background: string;
  /** background === "custom" 时使用（#rrggbb） */
  backgroundHex: string;
  radius: string;
}

/* ---------------- 主题色 ---------------- */

export const ACCENTS: AccentTheme[] = [
  { id: "indigo", name: "靛蓝", hue: 277 },
  { id: "blue", name: "天蓝", hue: 248 },
  { id: "cyan", name: "青碧", hue: 205 },
  { id: "emerald", name: "薄荷", hue: 162 },
  { id: "lime", name: "青柠", hue: 130 },
  { id: "amber", name: "琥珀", hue: 78 },
  { id: "coral", name: "珊瑚", hue: 25 },
  { id: "rose", name: "玫红", hue: 350 },
  { id: "violet", name: "紫罗兰", hue: 305 },
  { id: "graphite", name: "石墨", hue: 265, chroma: 0.2 },
];

export const CUSTOM_ACCENT_ID = "custom";
export const CUSTOM_BACKGROUND_ID = "custom";

/* ---------------- 背景色系 ---------------- */

export const BACKGROUNDS: BackgroundTheme[] = [
  // 深色系
  { id: "ambient", name: "环境光", mode: "dark", color: "#0b0d12", image: "accent" },
  { id: "solid", name: "纯深色", mode: "dark", color: "#0b0d12", image: "none" },
  {
    id: "midnight",
    name: "深海",
    mode: "dark",
    color: "#070b14",
    image:
      "radial-gradient(1200px 800px at 85% -10%, rgba(56,189,248,0.16), transparent 60%), " +
      "radial-gradient(1000px 700px at -10% 110%, rgba(59,130,246,0.12), transparent 55%)",
  },
  {
    id: "forest",
    name: "森夜",
    mode: "dark",
    color: "#070f0c",
    image:
      "radial-gradient(1200px 800px at 85% -10%, rgba(52,211,153,0.14), transparent 60%), " +
      "radial-gradient(1000px 700px at -10% 110%, rgba(16,185,129,0.1), transparent 55%)",
  },
  {
    id: "warm",
    name: "暖夜",
    mode: "dark",
    color: "#120d09",
    image:
      "radial-gradient(1200px 800px at 85% -10%, rgba(251,146,60,0.14), transparent 60%), " +
      "radial-gradient(1000px 700px at -10% 110%, rgba(244,63,94,0.1), transparent 55%)",
  },
  {
    id: "plum",
    name: "紫夜",
    mode: "dark",
    color: "#0d0913",
    image:
      "radial-gradient(1200px 800px at 85% -10%, rgba(168,85,247,0.16), transparent 60%), " +
      "radial-gradient(1000px 700px at -10% 110%, rgba(236,72,153,0.1), transparent 55%)",
  },
  // 浅色系
  {
    id: "linen",
    name: "米白",
    mode: "light",
    color: "#f7f4ef",
    image:
      "radial-gradient(1100px 700px at 85% -10%, rgba(251,191,36,0.1), transparent 60%), " +
      "radial-gradient(900px 600px at -10% 110%, rgba(249,115,22,0.06), transparent 55%)",
  },
  {
    id: "mist",
    name: "晨雾",
    mode: "light",
    color: "#eef1f6",
    image:
      "radial-gradient(1100px 700px at 85% -10%, rgba(148,163,184,0.16), transparent 60%), " +
      "radial-gradient(900px 600px at -10% 110%, rgba(100,116,139,0.08), transparent 55%)",
  },
  {
    id: "sky",
    name: "天青",
    mode: "light",
    color: "#e9f2fb",
    image:
      "radial-gradient(1100px 700px at 85% -10%, rgba(56,189,248,0.16), transparent 60%), " +
      "radial-gradient(900px 600px at -10% 110%, rgba(59,130,246,0.08), transparent 55%)",
  },
  {
    id: "mint",
    name: "薄荷",
    mode: "light",
    color: "#eaf6f0",
    image:
      "radial-gradient(1100px 700px at 85% -10%, rgba(52,211,153,0.16), transparent 60%), " +
      "radial-gradient(900px 600px at -10% 110%, rgba(16,185,129,0.08), transparent 55%)",
  },
];

export const DARK_BACKGROUNDS = BACKGROUNDS.filter((b) => b.mode === "dark");
export const LIGHT_BACKGROUNDS = BACKGROUNDS.filter((b) => b.mode === "light");

/* ---------------- 圆角 ---------------- */

export const RADII: RadiusTheme[] = [
  { id: "compact", name: "紧凑", radius: "8px" },
  { id: "normal", name: "标准", radius: "14px" },
  { id: "round", name: "圆润", radius: "20px" },
];

export const DEFAULT_THEME: ThemeConfig = {
  accent: "indigo",
  accentHex: "#6d7cff",
  background: "ambient",
  backgroundHex: "#0b0d12",
  radius: "normal",
};

/* ---------------- 颜色工具 ---------------- */

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** #rgb / #rrggbb → [r,g,b]（0-255），非法返回 null。 */
export function parseHex(input: string): [number, number, number] | null {
  const v = input.trim().replace(/^#/, "");
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function normalizeHex(input: string): string | null {
  const rgb = parseHex(input);
  if (!rgb) return null;
  return `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function srgbToLinear(u: number): number {
  const v = u / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** 相对亮度（0=黑 1=白），用于判断自定义底色属于深色系还是浅色系。 */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** sRGB 十六进制 → OKLCH（用于把用户/智能体给的颜色转成色相+饱和度）。 */
export function hexToOklch(hex: string): { l: number; c: number; h: number } | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(srgbToLinear);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l, c, h };
}

/* ---------------- 模式令牌（深色 / 浅色两套） ---------------- */

interface ModeTokens {
  vars: Record<string, string>;
  /** indigo 100→600 的亮度梯子（浅色系要反过来：文字用深色才看得清） */
  rampL: [number, number, number, number, number, number];
  /** 强调色透明度（浅底上用更低一点更干净） */
  accentAlpha: number;
}

const RAMP_CHROMA: [number, number, number, number, number, number] = [0.03, 0.055, 0.1, 0.15, 0.18, 0.19];

const MODE_TOKENS: Record<ThemeMode, ModeTokens> = {
  dark: {
    rampL: [0.94, 0.88, 0.8, 0.7, 0.62, 0.55],
    accentAlpha: 0.16,
    vars: {
      "--foreground": "#e7e9ee",
      "--card": "rgba(255,255,255,0.045)",
      "--card-foreground": "#e7e9ee",
      "--popover": "#171923",
      "--popover-foreground": "#e7e9ee",
      "--muted": "rgba(255,255,255,0.06)",
      "--muted-foreground": "#8b93a5",
      "--border": "rgba(255,255,255,0.09)",
      "--input": "rgba(255,255,255,0.1)",
      "--secondary": "rgba(255,255,255,0.07)",
      "--secondary-foreground": "#e7e9ee",
      "--primary-foreground": "#0b0d12",
      "--destructive": "#f87171",
      "--destructive-foreground": "#2a0f0f",
      // 表面叠加色：深色系用白（提亮）
      "--color-white": "#ffffff",
      "--glass-bg": "rgba(255,255,255,0.045)",
      "--glass-border": "rgba(255,255,255,0.08)",
      "--glass-shadow": "0 8px 32px rgba(0,0,0,0.35)",
      "--glass-blur": "18px",
      "--glass-blur-bar": "12px",
      "--glass-blur-float": "28px",
      "--glass-highlight": "rgba(255,255,255,0.07)",
      "--code-bg": "#0d0f16",
      "--scroll-thumb": "rgba(255,255,255,0.1)",
      "--sticky-head": "#101219",
      "--overlay": "rgba(0,0,0,0.5)",
      // 类别/状态色派生用的浓度（见 lib/colors.ts）
      "--tint-text": "22%",
      "--tint-from": "18%",
      "--tint-to": "6%",
    },
  },
  light: {
    rampL: [0.34, 0.4, 0.46, 0.54, 0.6, 0.66],
    accentAlpha: 0.12,
    vars: {
      "--foreground": "#1b2130",
      "--card": "rgba(15,23,42,0.03)",
      "--card-foreground": "#1b2130",
      "--popover": "#ffffff",
      "--popover-foreground": "#1b2130",
      "--muted": "rgba(15,23,42,0.05)",
      "--muted-foreground": "#5b6478",
      "--border": "rgba(15,23,42,0.1)",
      "--input": "rgba(15,23,42,0.08)",
      "--secondary": "rgba(15,23,42,0.05)",
      "--secondary-foreground": "#1b2130",
      "--primary-foreground": "#ffffff",
      "--destructive": "#dc2626",
      "--destructive-foreground": "#ffffff",
      // 关键：浅色系把叠加色换成墨色 → bg-white/N 从"提亮"变"压暗"
      "--color-white": "#0f172a",
      "--glass-bg": "rgba(255,255,255,0.62)",
      "--glass-border": "rgba(15,23,42,0.07)",
      "--glass-shadow": "0 8px 30px rgba(15,23,42,0.1)",
      // 浅色系磨砂：面板更透、高光是白色（而不是深色里的微白）
      "--glass-blur": "20px",
      "--glass-blur-bar": "14px",
      "--glass-blur-float": "30px",
      "--glass-highlight": "rgba(255,255,255,0.75)",
      "--code-bg": "#f2f4f9",
      "--scroll-thumb": "rgba(15,23,42,0.18)",
      "--sticky-head": "#f4f6fa",
      "--overlay": "rgba(15,23,42,0.35)",
      // 浅色系：文字里基色占比更高（混墨后是深色）；45% 是实测下限
      // （30% 太灰、50% 时琥珀色对比度只有 4.34:1 不达标，45% 最差 5.0:1）
      "--tint-text": "45%",
      "--tint-from": "30%",
      "--tint-to": "12%",
    },
  },
};

/* ---------------- 解析 ---------------- */

export function findAccent(id: string): AccentTheme | null {
  return ACCENTS.find((a) => a.id === id) ?? null;
}

export function findBackground(id: string): BackgroundTheme | null {
  return BACKGROUNDS.find((b) => b.id === id) ?? null;
}

export function findRadius(id: string): RadiusTheme {
  return RADII.find((r) => r.id === id) ?? RADII[1];
}

/** 当前主题的深浅基调（自定义底色按亮度自动判断）。 */
export function themeMode(cfg: ThemeConfig): ThemeMode {
  if (cfg.background === CUSTOM_BACKGROUND_ID) {
    return relativeLuminance(cfg.backgroundHex) > 0.35 ? "light" : "dark";
  }
  return findBackground(cfg.background)?.mode ?? "dark";
}

/** 主题色解析成 { hue, chromaScale }（预设用色相角，自定义用十六进制转 OKLCH）。 */
function resolveAccent(cfg: ThemeConfig): { hue: number; chromaScale: number; label: string } {
  if (cfg.accent === CUSTOM_ACCENT_ID) {
    const ok = hexToOklch(cfg.accentHex);
    if (ok) {
      return {
        hue: ok.h,
        // 以 0.16 为标准饱和度：太灰的颜色不至于没有色相感，过艳的稍微收一点
        chromaScale: clamp(ok.c / 0.16, 0.3, 1.4),
        label: `自定义 ${normalizeHex(cfg.accentHex) ?? cfg.accentHex}`,
      };
    }
  }
  const preset = findAccent(cfg.accent) ?? ACCENTS[0];
  return { hue: preset.hue, chromaScale: preset.chroma ?? 1, label: preset.name };
}

/** 主题色预览用的圆点颜色。 */
export function accentPreview(a: AccentTheme): string {
  return `oklch(70% ${(0.16 * (a.chroma ?? 1)).toFixed(3)} ${a.hue})`;
}

/** 跟随主题色的环境光：主光 + 两种偏移色，保持低饱和。 */
function accentGlow(hue: number, chromaScale: number, mode: ThemeMode): Record<string, string> {
  const scale = mode === "light" ? 0.75 : 1;
  const at = (l: number, c: number, h: number, alpha: number) =>
    `oklch(${l}% ${(c * chromaScale).toFixed(3)} ${(h + 360) % 360} / ${(alpha * scale).toFixed(3)})`;
  return {
    "--glow-a": at(mode === "light" ? 62 : 70, 0.16, hue, 0.18),
    "--glow-b": at(mode === "light" ? 68 : 74, 0.12, hue + 70, 0.11),
    "--glow-c": at(mode === "light" ? 64 : 72, 0.14, hue - 45, 0.07),
  };
}

const ACCENT_GLOW_IMAGE =
  "radial-gradient(1200px 800px at 85% -10%, var(--glow-a), transparent 60%), " +
  "radial-gradient(1000px 700px at -10% 110%, var(--glow-b), transparent 55%), " +
  "radial-gradient(900px 600px at 50% 50%, var(--glow-c), transparent 60%)";

export function themeCssVars(cfg: ThemeConfig): Record<string, string> {
  const mode = themeMode(cfg);
  const tokens = MODE_TOKENS[mode];
  const { hue, chromaScale } = resolveAccent(cfg);
  const radius = findRadius(cfg.radius);

  const ramp = RAMP_CHROMA.map(
    (base, i) => `oklch(${(tokens.rampL[i] * 100).toFixed(1)}% ${(base * chromaScale).toFixed(3)} ${hue})`,
  ) as [string, string, string, string, string, string];

  // 背景：自定义底色直接用；预设用自带底色；渐变统一"跟随主题色"或预设自带
  const bgColor =
    cfg.background === CUSTOM_BACKGROUND_ID
      ? (normalizeHex(cfg.backgroundHex) ?? tokens.vars["--foreground"])
      : (findBackground(cfg.background)?.color ?? "#0b0d12");
  const presetBg = findBackground(cfg.background);
  const bgImage = !presetBg || presetBg.image === "accent" || cfg.background === CUSTOM_BACKGROUND_ID
    ? ACCENT_GLOW_IMAGE
    : presetBg.image;

  return {
    ...tokens.vars,
    // 强调色阶（覆盖 Tailwind 的 indigo 调色板）
    "--color-indigo-100": ramp[0],
    "--color-indigo-200": ramp[1],
    "--color-indigo-300": ramp[2],
    "--color-indigo-400": ramp[3],
    "--color-indigo-500": ramp[4],
    "--color-indigo-600": ramp[5],
    // 主色 / 焦点环 / 选中底色
    "--primary": ramp[3],
    "--ring": ramp[3],
    "--accent": ramp[3].replace(/\)$/, ` / ${tokens.accentAlpha})`),
    // 选中态前景：深色系用亮色阶、浅色系用暗色阶（ramp[1] 在两套模式下都是"可读的那一侧"）
    "--accent-foreground": ramp[1],
    // 圆角基准（radius-sm/md/lg/xl/2xl/3xl 都由它派生）
    "--radius": radius.radius,
    // 背景
    "--background": bgColor,
    "--app-bg": bgColor,
    ...accentGlow(hue, chromaScale, mode),
    "--app-bg-image": bgImage,
  };
}

/** 把主题写到 :root 内联样式（内联样式优先级最高，稳定压过任何样式表规则）。 */
export function applyTheme(cfg: ThemeConfig): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeCssVars(cfg))) {
    root.style.setProperty(key, value);
  }
}

/** 从任意（可能是旧版/损坏的）配置里挑出合法值。 */
export function sanitizeTheme(input: unknown): ThemeConfig {
  const raw = (input ?? {}) as Partial<ThemeConfig>;
  const accentOk =
    raw.accent === CUSTOM_ACCENT_ID
      ? Boolean(normalizeHex(String(raw.accentHex ?? "")))
      : ACCENTS.some((a) => a.id === raw.accent);
  const backgroundOk =
    raw.background === CUSTOM_BACKGROUND_ID
      ? Boolean(normalizeHex(String(raw.backgroundHex ?? "")))
      : BACKGROUNDS.some((b) => b.id === raw.background);
  return {
    accent: accentOk ? (raw.accent as string) : DEFAULT_THEME.accent,
    accentHex: normalizeHex(String(raw.accentHex ?? "")) ?? DEFAULT_THEME.accentHex,
    background: backgroundOk ? (raw.background as string) : DEFAULT_THEME.background,
    backgroundHex: normalizeHex(String(raw.backgroundHex ?? "")) ?? DEFAULT_THEME.backgroundHex,
    radius: RADII.some((r) => r.id === raw.radius) ? (raw.radius as string) : DEFAULT_THEME.radius,
  };
}

/** 给智能体/设置页用的人类可读摘要。 */
export function describeTheme(cfg: ThemeConfig): string {
  const mode = themeMode(cfg);
  const bg =
    cfg.background === CUSTOM_BACKGROUND_ID
      ? `自定义 ${normalizeHex(cfg.backgroundHex) ?? cfg.backgroundHex}`
      : (findBackground(cfg.background)?.name ?? cfg.background);
  const { label } = resolveAccent(cfg);
  return `基调 ${mode === "light" ? "浅色" : "深色"} · 主题色 ${label} · 背景 ${bg} · 圆角 ${findRadius(cfg.radius).name}`;
}
