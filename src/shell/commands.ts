import { commands } from "../kernel/commands";
import { useCalendarStore } from "../stores/calendarStore";
import { useThemeStore } from "../stores/themeStore";
import { useUiStore } from "../stores/uiStore";
import { CALENDAR_MODES, WORKBENCH } from "./workbench";

/**
 * 应用级命令（注册进内核命令注册表，Cmd+K 可见）。
 *
 * 工作台与弹层命令从注册表派生 —— 新增工作台/面板只改 workbench.ts，
 * 命令自动出现，不需要再手写一遍。
 */
export function registerAppCommands(): void {
  commands.register({
    id: "app.newEvent",
    title: "新建事件",
    keywords: ["创建", "日程"],
    run: () => useUiStore.getState().openCreateDialog(),
  });
  commands.register({
    id: "app.goToday",
    title: "回到今天",
    keywords: ["今天"],
    run: () => {
      useUiStore.getState().setAppView("calendar");
      useCalendarStore.getState().goToday();
    },
  });

  for (const mode of CALENDAR_MODES) {
    commands.register({
      id: mode.id === "week" ? "app.viewWeek" : "app.viewMonth",
      title: `切换到${mode.label}视图`,
      keywords: [mode.label, mode.id, "视图"],
      run: () => {
        useUiStore.getState().setAppView("calendar");
        useCalendarStore.getState().setView(mode.id);
      },
    });
  }

  commands.register({
    id: "app.openCalendar",
    title: "回到日历",
    keywords: ["日历", "calendar", "日程", "回到"],
    run: () => useUiStore.getState().setAppView("calendar"),
  });

  // 求职中心内部页签
  const jobTabs: { id: "preparing" | "applied" | "scout"; title: string; keywords: string[] }[] = [
    { id: "preparing", title: "准备投递", keywords: ["待投", "准备", "想投"] },
    { id: "applied", title: "已投递看板", keywords: ["投递", "看板", "面试", "offer"] },
    { id: "scout", title: "校招信息库", keywords: ["校招", "招聘", "信息库", "scout", "抓取"] },
  ];
  for (const t of jobTabs) {
    commands.register({
      id: `app.jobTab.${t.id}`,
      title: `求职中心 · ${t.title}`,
      keywords: t.keywords,
      run: () => {
        const ui = useUiStore.getState();
        ui.setAppView("jobs");
        ui.setJobTab(t.id);
      },
    });
  }

  commands.register({
    id: "app.openHabits",
    title: "习惯（每天固定安排）",
    keywords: ["习惯", "每日", "固定", "routine", "habit"],
    run: () => useUiStore.getState().setHabitsOpen(true),
  });

  // 邮箱 / 知识库 现在是工作台条目，命令由下面的 WORKBENCH 循环派生，不要手写（会重复注册）

  for (const w of WORKBENCH) {
    commands.register({
      id: `app.open${w.id[0].toUpperCase()}${w.id.slice(1)}`,
      title: `打开${w.title}`,
      keywords: w.keywords,
      run: () => useUiStore.getState().setAppView(w.id),
    });
  }



  commands.register({
    id: "app.openTheme",
    title: "主题与风格",
    keywords: ["主题", "配色", "颜色", "风格", "外观", "圆角", "背景", "theme"],
    run: () => useThemeStore.getState().setPanelOpen(true),
  });
}