import { useEffect } from "react";
import { motion } from "framer-motion";
import { useCalendarStore } from "../stores/calendarStore";
import { useUiStore } from "../stores/uiStore";
import { cn } from "../lib/utils";
import { TitleBar } from "./TitleBar";
import { ChatCard } from "./chat/ChatCard";
import { AppOverlays } from "./AppOverlays";
import { Rail } from "./Rail";
import { CalendarPanel } from "./CalendarPanel";
import { TopBar } from "./TopBar";
import { WorkbenchArea } from "./WorkbenchArea";
import { useAppShortcuts } from "./hooks/useAppShortcuts";
import { useCloseRequestListener } from "./hooks/useCloseRequest";

/**
 * 应用外壳：标题栏 + 图标栏 + 主区 + 侧边 AI 卡片 + 弹层栈。
 *
 * 两个 AI 入口，分工明确：
 * - **rail「AI」→ 页面**：长对话、翻历史、看宽屏正文；
 * - **顶栏 💬 → 卡片**：浮在当前页面上的 360px 抽屉，问一句就走。
 * 两者共用同一份会话状态（chatStore）。
 */
export default function App() {
  const reload = useCalendarStore((s) => s.reload);
  const appView = useUiStore((s) => s.appView);
  const isCalendar = appView === "calendar";

  useEffect(() => {
    void reload();
  }, [reload]);

  useCloseRequestListener();
  useAppShortcuts();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Rail />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <motion.main
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 24 }}
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              isCalendar ? "p-2" : "px-3 pb-3 pt-2",
            )}
          >
            {isCalendar ? (
              <div className="glass flex min-h-0 flex-1 overflow-hidden rounded-3xl">
                <CalendarPanel />
                <div className="flex min-w-0 flex-1 flex-col">
                  <TopBar />
                  <WorkbenchArea />
                </div>
              </div>
            ) : (
              <WorkbenchArea />
            )}
          </motion.main>
          <ChatCard />
        </div>
      </div>
      <AppOverlays />
    </div>
  );
}
