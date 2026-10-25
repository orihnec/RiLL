import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minimize2, Power } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { rememberCloseBehavior } from "./closeWindow";
import type { CloseBehavior } from "../kernel/closeBehavior";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 关闭确认（✕ / Alt+F4）：**只问一次**。
 *
 * 选完就记住，之后按这个方式静默执行；想换方式去 设置 → 关闭窗口
 * （那里也能选回「每次询问」）。关闭（X / Esc / 点遮罩）= 取消本次关闭。
 */
export function CloseConfirmDialog({ open, onClose }: Props) {
  const win = getCurrentWindow();

  const run = (behavior: Exclude<CloseBehavior, "ask">) => {
    onClose();
    void rememberCloseBehavior(behavior);
    if (behavior === "tray") void win.hide();
    else void invoke("quit");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>关闭 Rill</DialogTitle>
          <DialogDescription>
            只需选这一次：以后关闭都按这个方式执行，随时可在 设置 → 关闭窗口 修改。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-1">
          <Button autoFocus onClick={() => run("tray")} className="h-10 gap-2" title="隐藏窗口，后台继续运行（提醒照常）">
            <Minimize2 className="size-4" />
            最小化到托盘
          </Button>
          <Button
            variant="outline"
            onClick={() => run("quit")}
            className="h-10 gap-2"
            title="关闭所有窗口并结束进程"
          >
            <Power className="size-4" />
            退出程序
          </Button>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/45">
            关到托盘后应用继续运行，点托盘图标可重新打开；要彻底退出也可用托盘菜单。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
