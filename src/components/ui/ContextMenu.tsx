import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

export interface CtxMenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** 两步确认文案（如"确认删除？"），再次点击才执行 */
  confirmLabel?: string;
  onSelect: () => void;
}

interface Props {
  x: number;
  y: number;
  items: CtxMenuItem[];
  onClose: () => void;
}

/**
 * 右键上下文菜单：Portal 到 body（避开 .glass backdrop-filter 劫持 fixed 的地雷），
 * 视口钳制 + 外部点击/Esc/滚动/窗口变化关闭 + 危险项两步确认。
 */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);

  // 视口钳制：菜单不超出窗口
  const W = 190;
  const H = items.length * 30 + 10;
  const left = Math.max(8, Math.min(x, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - H - 8));

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    const onResize = () => onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose]);

  const click = (idx: number) => {
    const item = items[idx];
    if (!item || item.disabled) return;
    if (item.confirmLabel && confirmIdx !== idx) {
      setConfirmIdx(idx);
      setTimeout(() => setConfirmIdx(null), 2500);
      return;
    }
    item.onSelect();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      className="glass-float fixed z-[100] min-w-[190px] rounded-xl p-1 text-popover-foreground"
      style={{ left, top }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => click(i)}
          disabled={item.disabled}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition",
            item.danger
              ? "text-red-300 hover:bg-red-500/15"
              : "text-foreground/85 hover:bg-white/8",
            confirmIdx === i && "bg-red-500/20",
            item.disabled && "opacity-40",
          )}
        >
          {item.icon}
          <span className="truncate">{confirmIdx === i ? item.confirmLabel : item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
