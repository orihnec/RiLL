/** 事件类别 = 颜色。低饱和渐变 + 左侧色条。 */
export interface Category {
  id: string;
  name: string;
  /** 左侧色条颜色 */
  bar: string;
  /** 卡片渐变（深底低饱和） */
  from: string;
  to: string;
  /** 文字颜色 */
  text: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "default",
    name: "默认",
    bar: "#94a3b8",
    from: "rgba(148,163,184,0.16)",
    to: "rgba(148,163,184,0.05)",
    text: "#e2e8f0",
  },
  {
    id: "work",
    name: "工作",
    bar: "#a5b4fc",
    from: "rgba(129,140,248,0.18)",
    to: "rgba(129,140,248,0.05)",
    text: "#e0e7ff",
  },
  {
    id: "meeting",
    name: "会议",
    bar: "#7dd3fc",
    from: "rgba(56,189,248,0.16)",
    to: "rgba(56,189,248,0.05)",
    text: "#e0f2fe",
  },
  {
    id: "focus",
    name: "专注",
    bar: "#c4b5fd",
    from: "rgba(167,139,250,0.16)",
    to: "rgba(167,139,250,0.05)",
    text: "#ede9fe",
  },
  {
    id: "personal",
    name: "个人",
    bar: "#5eead4",
    from: "rgba(45,212,191,0.15)",
    to: "rgba(45,212,191,0.05)",
    text: "#ccfbf1",
  },
  {
    id: "health",
    name: "健康",
    bar: "#6ee7b7",
    from: "rgba(52,211,153,0.15)",
    to: "rgba(52,211,153,0.05)",
    text: "#d1fae5",
  },
  {
    id: "travel",
    name: "出行",
    bar: "#fcd34d",
    from: "rgba(251,191,36,0.14)",
    to: "rgba(251,191,36,0.05)",
    text: "#fef9c3",
  },
  {
    id: "important",
    name: "重要",
    bar: "#fda4af",
    from: "rgba(251,113,133,0.16)",
    to: "rgba(251,113,133,0.05)",
    text: "#ffe4e6",
  },
];

export function categoryOf(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}
