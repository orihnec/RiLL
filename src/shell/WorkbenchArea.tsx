import { Suspense } from "react";
import { useCalendarStore } from "../stores/calendarStore";
import { useUiStore } from "../stores/uiStore";
import { WeekView } from "../modules/calendar/components/WeekView";
import { MonthView } from "../modules/calendar/components/MonthView";
import { WORKBENCH_BY_ID } from "./workbench";

/**
 * 主区渲染：日历（周/月）或注册表里的工作台。
 * 不再是 if/else 链 —— 工作台组件由 WORKBENCH 提供。
 */
export function WorkbenchArea() {
  const appView = useUiStore((s) => s.appView);
  const view = useCalendarStore((s) => s.view);

  if (appView === "calendar") {
    return view === "week" ? <WeekView /> : <MonthView />;
  }

  const entry = WORKBENCH_BY_ID.get(appView);
  if (!entry) return null;
  const View = entry.Component;
  return (
    <Suspense fallback={null}>
      <View />
    </Suspense>
  );
}
