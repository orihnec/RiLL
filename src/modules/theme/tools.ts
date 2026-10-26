import { z } from "zod";
import type { Tool } from "../../kernel/agent/types";
import {
  ACCENTS,
  BACKGROUNDS,
  RADII,
  CUSTOM_ACCENT_ID,
  CUSTOM_BACKGROUND_ID,
  describeTheme,
  hexToOklch,
  normalizeHex,
  relativeLuminance,
  type ThemeConfig,
} from "../../lib/themes";
import { useThemeStore } from "../../stores/themeStore";
import { FONT_SIZES } from "../../lib/typography";

/** 当前主题 + 可选项清单（智能体据此设计配色）。 */
function themeSnapshot(): string {
  const s = useThemeStore.getState();
  const cfg: ThemeConfig = {
    accent: s.accent,
    accentHex: s.accentHex,
    background: s.background,
    backgroundHex: s.backgroundHex,
    radius: s.radius,
    fontSize: s.fontSize,
  };
  const accents = ACCENTS.map((a) => `${a.id}(${a.name})`).join("、");
  const dark = BACKGROUNDS.filter((b) => b.mode === "dark").map((b) => `${b.id}(${b.name})`).join("、");
  const light = BACKGROUNDS.filter((b) => b.mode === "light").map((b) => `${b.id}(${b.name})`).join("、");
  return (
    `当前主题：${describeTheme(cfg)}\n` +
    `（自定义主题色 ${normalizeHex(cfg.accentHex) ?? cfg.accentHex}，自定义底色 ${normalizeHex(cfg.backgroundHex) ?? cfg.backgroundHex}）\n\n` +
    `可选主题色 accent：${accents}，或任意十六进制色（如 "#14b8a6"）\n` +
    `可选背景 background：深色系 ${dark}；浅色系 ${light}，或任意十六进制底色（深浅基调按亮度自动判断）\n` +
    `可选圆角 radius：${RADII.map((r) => `${r.id}(${r.name})`).join("、")}\n` +
    `可选字号 fontSize：${FONT_SIZES.map((s) => `${s.id}(${s.name})`).join("、")}`
  );
}

const theme_get: Tool = {
  name: "theme_get",
  description:
    "查看当前界面主题（基调深浅 / 主题色 / 背景 / 字号）以及全部可选项。用户提到想换主题、配色、外观、字号大小、太亮太暗、想要某个颜色时，先调用它了解现状再做建议。",
  parameters: z.object({}),
  execute: async () => themeSnapshot(),
};

const theme_set: Tool = {
  name: "theme_set",
  description:
    "修改界面主题并立即生效（会持久化保存）。可用参数任意组合：accent=预设 id 或十六进制色（如 #14b8a6）；background=预设 id 或十六进制底色（浅色底会自动切成浅色系）；fontSize=small|medium|large；radius=compact|normal|round；reset=true 恢复默认。用户说「换成青绿色」「浅色系、米白底」「把字调大」「恢复默认主题」时使用；改之前可先用 theme_get 看可选值。属于外观设置，可直接执行并在回复里说明改成了什么。",
  parameters: z.object({
    accent: z.string().optional().describe('主题色：预设 id（indigo/blue/cyan/emerald/lime/amber/coral/rose/violet/graphite）或十六进制色 "#14b8a6"'),
    background: z
      .string()
      .optional()
      .describe('背景：预设 id（ambient/solid/midnight/forest/warm/plum 为深色系；linen/mist/sky/mint 为浅色系）或十六进制底色 "#f7f4ef"'),
    radius: z.enum(["compact", "normal", "round"]).optional().describe("圆角：紧凑/标准/圆润"),
    fontSize: z.enum(["small", "medium", "large"]).optional().describe("整个应用的字号大小：小/中/大"),
    reset: z.boolean().optional().describe("true = 恢复默认主题（忽略其它参数）"),
  }),
  execute: async (args) => {
    const store = useThemeStore.getState();
    if (args.reset === true) {
      store.reset();
      return `已恢复默认主题：${describeTheme(useThemeStore.getState())}`;
    }

    const notes: string[] = [];
    const patch: Partial<ThemeConfig> = {};

    // 主题色：预设 id 优先，其次按十六进制解析
    if (args.accent !== undefined) {
      const raw = String(args.accent).trim();
      const preset = ACCENTS.find((a) => a.id === raw || a.name === raw);
      if (preset) {
        patch.accent = preset.id;
        notes.push(`主题色 → ${preset.name}`);
      } else {
        const hex = normalizeHex(raw);
        if (hex && hexToOklch(hex)) {
          patch.accent = CUSTOM_ACCENT_ID;
          patch.accentHex = hex;
          notes.push(`主题色 → ${hex}（自定义）`);
        } else {
          notes.push(`主题色 "${raw}" 无法识别（可用预设 id 或 #rrggbb），已跳过`);
        }
      }
    }

    // 背景：预设 id 优先，其次十六进制底色
    if (args.background !== undefined) {
      const raw = String(args.background).trim();
      const preset = BACKGROUNDS.find((b) => b.id === raw || b.name === raw);
      if (preset) {
        patch.background = preset.id;
        notes.push(`背景 → ${preset.name}（${preset.mode === "light" ? "浅色系" : "深色系"}）`);
      } else {
        const hex = normalizeHex(raw);
        if (hex) {
          patch.background = CUSTOM_BACKGROUND_ID;
          patch.backgroundHex = hex;
          const bgMode = relativeLuminance(hex) > 0.35 ? "浅色系" : "深色系";
          notes.push(`背景 → ${hex}（自定义，${bgMode}）`);
        } else {
          notes.push(`背景 "${raw}" 无法识别（可用预设 id 或 #rrggbb），已跳过`);
        }
      }
    }

    if (args.radius !== undefined) {
      const r = RADII.find((x) => x.id === args.radius);
      if (r) {
        patch.radius = r.id;
        notes.push(`圆角 → ${r.name}`);
      }
    }

    if (args.fontSize !== undefined) {
      const size = FONT_SIZES.find((s) => s.id === args.fontSize);
      if (size) {
        patch.fontSize = size.id;
        notes.push(`字号 → ${size.name}`);
      }
    }

    if (notes.length === 0) return `没有需要修改的内容。${themeSnapshot()}`;
    const applied = store.apply(patch);
    return `主题已更新（立即生效并已保存）：${notes.join("；")}\n现在的主题：${describeTheme(applied)}`;
  },
};

export const themeTools: Record<string, Tool> = {
  theme_get,
  theme_set,
};
