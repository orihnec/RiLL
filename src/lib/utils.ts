import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// 让合并器把自定义字号识别为 font-size，避免被同一元素的文字颜色覆盖。
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["ui-9", "ui-9-5", "ui-10", "ui-10-5", "ui-11", "ui-11-5", "ui-12", "ui-12-5", "ui-13", "ui-15"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
