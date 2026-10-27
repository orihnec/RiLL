import { useState } from "react";
import { Check, Palette, Pipette, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { cn } from "../lib/utils";
import {
  ACCENTS,
  DARK_BACKGROUNDS,
  LIGHT_BACKGROUNDS,
  CUSTOM_ACCENT_ID,
  CUSTOM_BACKGROUND_ID,
  accentPreview,
  hexToOklch,
  normalizeHex,
  themeMode,
  type BackgroundTheme,
} from "../lib/themes";
import { FONT_SIZES, FONT_SCALES } from "../lib/typography";
import { useThemeStore } from "../stores/themeStore";

/** 背景风格预览小方块（用该风格自己的渐变）。 */
function BackgroundChip({
  preset,
  active,
  accentColor,
  onClick,
}: {
  preset: BackgroundTheme;
  active: boolean;
  accentColor: string;
  onClick: () => void;
}) {
  const style =
    preset.image === "accent"
      ? { background: `linear-gradient(135deg, ${accentColor}66, transparent 70%), ${preset.color}` }
      : { background: preset.image === "none" ? preset.color : `${preset.image}, ${preset.color}` };
  return (
    <button
      onClick={onClick}
      title={preset.name}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-1.5 py-1.5 text-ui-10 transition",
        active
          ? "border-indigo-400/50 bg-indigo-400/10 text-indigo-200"
          : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="size-7 rounded-md border border-white/10" style={style} />
      {preset.name}
    </button>
  );
}

/** 自定义颜色输入：原生取色器 + 十六进制输入框。 */
function CustomColor({
  value,
  active,
  onApply,
  hint,
}: {
  value: string;
  active: boolean;
  onApply: (hex: string) => void;
  hint: string;
}) {
  const [text, setText] = useState(value);
  const valid = normalizeHex(text) !== null;
  const commit = () => {
    const hex = normalizeHex(text);
    if (hex) onApply(hex);
  };
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-1.5 py-1",
        active ? "border-indigo-400/50 bg-indigo-400/10" : "border-white/8 bg-white/3",
      )}
    >
      <label className="relative flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-white/15" title="打开取色器">
        <span className="absolute inset-0 rounded-md" style={{ background: value }} />
        <Pipette className="relative size-3 text-white/80 mix-blend-difference" />
        <input
          type="color"
          value={value}
          onChange={(e) => {
            setText(e.target.value);
            onApply(e.target.value);
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        placeholder="#rrggbb"
        className={cn(
          "h-6 w-20 bg-transparent font-mono text-ui-10 outline-none",
          valid ? "text-foreground/85" : "text-red-300",
        )}
      />
      <span className="truncate text-ui-9 text-muted-foreground/45">{hint}</span>
    </div>
  );
}

/**
 * 顶栏「主题与风格」入口：主题色（预设 + 自定义）/ 背景色系（深色系 / 浅色系 + 自定义）/ 字号。
 * 点一下立即生效并持久化；同一份配置智能体也能改（modules/theme/tools.ts）。
 */
export function ThemeButton() {
  const accent = useThemeStore((s) => s.accent);
  const accentHex = useThemeStore((s) => s.accentHex);
  const background = useThemeStore((s) => s.background);
  const backgroundHex = useThemeStore((s) => s.backgroundHex);
  const radius = useThemeStore((s) => s.radius);
  const fontSize = useThemeStore((s) => s.fontSize);
  const panelOpen = useThemeStore((s) => s.panelOpen);
  const setPanelOpen = useThemeStore((s) => s.setPanelOpen);
  const setAccent = useThemeStore((s) => s.setAccent);
  const setAccentHex = useThemeStore((s) => s.setAccentHex);
  const setBackground = useThemeStore((s) => s.setBackground);
  const setBackgroundHex = useThemeStore((s) => s.setBackgroundHex);
  const setFontSize = useThemeStore((s) => s.setFontSize);
  const reset = useThemeStore((s) => s.reset);

  const mode = themeMode({ accent, accentHex, background, backgroundHex, radius, fontSize });
  const previewColor = accent === CUSTOM_ACCENT_ID
    ? (hexToOklch(accentHex) ? accentPreview({ id: "x", name: "x", hue: hexToOklch(accentHex)!.h, chroma: hexToOklch(accentHex)!.c / 0.16 }) : accentHex)
    : accentPreview(ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0]);

  return (
    <Popover open={panelOpen} onOpenChange={setPanelOpen}>
      <PopoverTrigger asChild>
        <button
          title="主题与风格（深浅色系 / 自定义颜色 / 字号大小）"
          className={cn(
            "flex size-7 items-center justify-center rounded-lg outline-none transition",
            panelOpen
              ? "bg-indigo-400/15 text-indigo-200"
              : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
          )}
        >
          <Palette className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="max-h-[80vh] w-80 overflow-y-auto p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Palette className="size-3.5 text-indigo-300" />
          <span className="text-xs font-semibold">主题与风格</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-px text-ui-9 text-muted-foreground">
            {mode === "light" ? "浅色系" : "深色系"}
          </span>
          <button
            onClick={reset}
            className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-ui-10 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            恢复默认
          </button>
        </div>

        {/* 主题色 */}
        <div className="mb-1 text-ui-10 text-muted-foreground/60">主题色（强调色）</div>
        <div className="mb-1.5 grid grid-cols-10 gap-1">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccent(a.id)}
              title={a.name}
              className={cn(
                "flex aspect-square items-center justify-center rounded-full border transition hover:scale-110",
                accent === a.id ? "border-white/60" : "border-white/10",
              )}
              style={{ background: accentPreview(a) }}
            >
              {accent === a.id && <Check className="size-3 text-black/70" />}
            </button>
          ))}
        </div>
        <div className="mb-3">
          <CustomColor
            value={accentHex}
            active={accent === CUSTOM_ACCENT_ID}
            onApply={setAccentHex}
            hint="自定义主题色"
          />
        </div>

        {/* 背景：深色系 */}
        <div className="mb-1 text-ui-10 text-muted-foreground/60">背景 · 深色系</div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {DARK_BACKGROUNDS.map((b) => (
            <BackgroundChip
              key={b.id}
              preset={b}
              active={background === b.id}
              accentColor={previewColor}
              onClick={() => setBackground(b.id)}
            />
          ))}
        </div>

        {/* 背景：浅色系 */}
        <div className="mb-1 text-ui-10 text-muted-foreground/60">背景 · 浅色系</div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {LIGHT_BACKGROUNDS.map((b) => (
            <BackgroundChip
              key={b.id}
              preset={b}
              active={background === b.id}
              accentColor={previewColor}
              onClick={() => setBackground(b.id)}
            />
          ))}
        </div>

        <div className="mb-3">
          <CustomColor
            value={backgroundHex}
            active={background === CUSTOM_BACKGROUND_ID}
            onApply={setBackgroundHex}
            hint="自定义底色（自动判断深浅）"
          />
        </div>

        {/* 字号大小 */}
        <div id="font-size-label" className="mb-1 text-ui-10 text-muted-foreground/60">字号大小</div>
        <div role="group" aria-labelledby="font-size-label" className="flex gap-1.5">
          {FONT_SIZES.map((s) => (
            <button
              key={s.id}
              onClick={() => setFontSize(s.id)}
              aria-pressed={fontSize === s.id}
              className={cn(
                "flex-1 rounded-lg border px-2 py-1 text-ui-11 transition",
                fontSize === s.id
                  ? "border-indigo-400/50 bg-indigo-400/10 text-indigo-200"
                  : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
              )}
            >
              {s.name}
              <span className="ml-1 opacity-70">{Math.round(FONT_SCALES[s.id] * 100)}%</span>
            </button>
          ))}
        </div>

        <p className="mt-2.5 text-ui-10 leading-relaxed text-muted-foreground/45">
          主题色会同时改变按钮、选中态、标签与背景环境光；浅色系会自动把面板与描边切换成深色淡墨。
          字号大小应用于整个应用。
          设置立即生效并自动保存，也可以直接对 AI 说「把主题换成青绿色浅色系」。
        </p>
      </PopoverContent>
    </Popover>
  );
}
