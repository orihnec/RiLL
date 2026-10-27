export type FontSize = "small" | "medium" | "large";

export const FONT_SIZES: { id: FontSize; name: string }[] = [
  { id: "small", name: "小" },
  { id: "medium", name: "中" },
  { id: "large", name: "大" },
];

export const FONT_SCALES: Record<FontSize, number> = {
  small: 1,
  medium: 1.2,
  large: 1.5,
};
