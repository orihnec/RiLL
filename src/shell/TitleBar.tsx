import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  CalendarDays,
  Command as CommandIcon,
  MessageSquare,
  PanelsTopLeft,
  Minus,
  Minimize2,
  PanelTopOpen,
  Square,
  X,
} from "lucide-react";
import { useChatStore } from "../stores/chatStore";
import { useUiStore } from "../stores/uiStore";
import { cn } from "../lib/utils";
import { ThemeButton } from "./ThemePanel";
import { requestClose } from "./closeWindow";
import { toggleOverviewWindow } from "./overviewWindow";

/**
 * 自定义标题栏（无边框窗口）：与界面一体化。
 * - 左：拖动区（data-tauri-drag-region，内置双击最大化/还原、拖动窗口）
 * - 右：**全局动作**（AI / 主题 / 悬浮窗 / 命令栏）+ 窗口控制
 *
 * 全局动作放这里而不是每个页面各顶一条工具栏 —— 各页面已有自己的标题栏。
 */
export function TitleBar() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);
  const appView = useUiStore((s) => s.appView);
  const chatOpen = useChatStore((s) => s.open);
  const chatSetOpen = useChatStore((s) => s.setOpen);
  useEffect(() => {
    void win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => {
      void win.isMaximized().then(setMaximized);
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [win]);

  // macOS 用系统原生红绿灯（tauri.macos.conf.json 里 titleBarStyle=Overlay），
  // 所以左侧留出红绿灯的位置、右侧不再画我们自己那三个窗口按钮。
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

  const iconBtn =
    "flex size-7 items-center justify-center rounded-lg text-muted-foreground outline-none transition hover:bg-white/10 hover:text-foreground";

  return (
    <div className="glass-bar flex h-9 shrink-0 select-none items-stretch border-b">
      {/* 拖动区：装饰元素 pointer-events-none，保证 mousedown 落在容器上触发拖拽 */}
      <div data-tauri-drag-region className={cn("flex min-w-0 flex-1 items-center gap-2 pr-2", isMac ? "pl-[78px]" : "pl-3")}>
        <div className="pointer-events-none flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500/70 to-sky-500/40">
          <CalendarDays className="size-3 text-white" />
        </div>
        <span className="pointer-events-none text-xs font-semibold tracking-wide text-foreground/85">
          Rill
        </span>
        <span className="pointer-events-none rounded-full border border-indigo-400/20 bg-indigo-400/10 px-1.5 py-px text-ui-9 font-medium text-indigo-300">
          AI
        </span>
      </div>

      {/* 全局动作（不参与拖动区，可点击） */}
      <div className="flex items-center gap-0.5 pr-1">
        <button
          onClick={() => chatSetOpen(!chatOpen)}
          title="AI 卡片（顺手问一句）"
          className={cn(iconBtn, chatOpen && "bg-indigo-400/15 text-indigo-200")}
        >
          <MessageSquare className="size-3.5" />
        </button>
        <button
          onClick={() => useUiStore.getState().setAppView(appView === "chat" ? "calendar" : "chat")}
          title="AI 助手页面（长对话 / 历史）"
          className={cn(iconBtn, appView === "chat" && "bg-indigo-400/15 text-indigo-200")}
        >
          <PanelsTopLeft className="size-3.5" />
        </button>
        <ThemeButton />
        <button onClick={() => void toggleOverviewWindow()} title="今日日程悬浮窗（置顶）" className={iconBtn}>
          <PanelTopOpen className="size-3.5" />
        </button>
        <button
          onClick={() => useUiStore.getState().setPaletteOpen(true)}
          title="命令栏 / AI（Ctrl+K）"
          className="flex h-7 items-center gap-1 rounded-lg px-1.5 leading-none text-muted-foreground outline-none transition hover:bg-white/10 hover:text-foreground"
        >
          <CommandIcon className="size-3.5 shrink-0" />
          <span className="hidden text-ui-10 tracking-tight lg:inline">{isMac ? "⌘K" : "Ctrl+K"}</span>
        </button>
      </div>

      {!isMac && <div className="mx-1 w-px self-stretch bg-white/8" aria-hidden />}

      {/* 窗口控制按钮（macOS 交给系统红绿灯） */}
      <div className={cn("flex items-stretch", isMac && "hidden")}>
        <button
          onClick={() => void win.minimize()}
          title="最小化"
          className="flex w-11 items-center justify-center text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          onClick={() => void win.toggleMaximize()}
          title={maximized ? "还原" : "最大化"}
          className="flex w-11 items-center justify-center text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
        >
          {maximized ? <Minimize2 className="size-3.5" /> : <Square className="size-3" />}
        </button>
        <button
          onClick={() => void requestClose()}
          title="关闭（默认最小化到托盘）"
          className="flex w-11 items-center justify-center text-muted-foreground transition hover:bg-red-500 hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
