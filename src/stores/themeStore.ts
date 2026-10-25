import { create } from "zustand";
import { getDb } from "../kernel/db";
import {
  applyTheme,
  sanitizeTheme,
  normalizeHex,
  DEFAULT_THEME,
  CUSTOM_ACCENT_ID,
  CUSTOM_BACKGROUND_ID,
  type ThemeConfig,
} from "../lib/themes";

/** 主题设置持久化在 app_settings（key = ui_theme，JSON）。 */
const KEY = "ui_theme";

interface ThemeState extends ThemeConfig {
  loaded: boolean;
  /** TopBar 主题面板开关（Cmd+K 命令 / 智能体也能打开） */
  panelOpen: boolean;
  load: () => Promise<void>;
  /** 预设主题色 id；传 "custom" 时用当前 accentHex */
  setAccent: (id: string) => void;
  /** 自定义主题色（#rrggbb 或 rrggbb） */
  setAccentHex: (hex: string) => void;
  setBackground: (id: string) => void;
  /** 自定义底色（自动按亮度判断深/浅基调） */
  setBackgroundHex: (hex: string) => void;
  setRadius: (id: string) => void;
  /** 一次性设置多项（智能体 theme_set 用）；返回是否有非法值被忽略 */
  apply: (patch: Partial<ThemeConfig>) => ThemeConfig;
  reset: () => void;
  setPanelOpen: (open: boolean) => void;
}

async function persist(cfg: ThemeConfig): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [KEY, JSON.stringify(cfg)],
  );
}

/** 改一项 → 立即应用 + 落库（失败只告警，不影响当前会话的视觉效果）。 */
function commit(
  set: (partial: Partial<ThemeState>) => void,
  get: () => ThemeState,
  patch: Partial<ThemeConfig>,
): void {
  const cfg: ThemeConfig = {
    accent: get().accent,
    accentHex: get().accentHex,
    background: get().background,
    backgroundHex: get().backgroundHex,
    radius: get().radius,
    ...patch,
  };
  applyTheme(cfg);
  set(cfg);
  void persist(cfg).catch((e) => console.warn("[theme] 保存失败", e));
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  ...DEFAULT_THEME,
  loaded: false,
  panelOpen: false,

  load: async () => {
    try {
      const db = getDb();
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM app_settings WHERE key = $1",
        [KEY],
      );
      let cfg = DEFAULT_THEME;
      if (rows[0]?.value) {
        try {
          cfg = sanitizeTheme(JSON.parse(rows[0].value));
        } catch {
          cfg = DEFAULT_THEME;
        }
      }
      applyTheme(cfg);
      set({ ...cfg, loaded: true });
    } catch (e) {
      console.warn("[theme] 读取失败，使用默认主题", e);
      applyTheme(DEFAULT_THEME);
      set({ ...DEFAULT_THEME, loaded: true });
    }
  },

  setAccent: (id) => commit(set, get, { accent: id }),
  setAccentHex: (hex) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    commit(set, get, { accent: CUSTOM_ACCENT_ID, accentHex: normalized });
  },
  setBackground: (id) => commit(set, get, { background: id }),
  setBackgroundHex: (hex) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    commit(set, get, { background: CUSTOM_BACKGROUND_ID, backgroundHex: normalized });
  },
  setRadius: (id) => commit(set, get, { radius: id }),

  /** 智能体/设置页批调用：非法值会被忽略，返回最终生效的配置。 */
  apply: (patch) => {
    const raw = {
      accent: get().accent,
      accentHex: get().accentHex,
      background: get().background,
      backgroundHex: get().backgroundHex,
      radius: get().radius,
      ...patch,
    };
    const clean = sanitizeTheme(raw);
    applyTheme(clean);
    set(clean);
    void persist(clean).catch((e) => console.warn("[theme] 保存失败", e));
    return clean;
  },

  reset: () => commit(set, get, DEFAULT_THEME),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
}));
