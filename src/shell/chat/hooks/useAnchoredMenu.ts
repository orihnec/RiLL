import { useEffect, useRef, useState } from "react";

export interface MenuPos {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

/**
 * 锚定在按钮上的浮层菜单（模型选择器用）。
 *
 * 关键点：`.glass` 的 backdrop-filter 会劫持 fixed 定位，所以菜单必须
 * createPortal 到 body；这里只负责定位计算与"外部点击 / Esc / 滚动关闭"。
 */
export function useAnchoredMenu({ disabled }: { disabled: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = () => {
    if (disabled) return;
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 240);
    // 右边界钳制：菜单不超出窗口右侧
    const left = Math.min(r.left, Math.max(8, window.innerWidth - width - 8));
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    // 下方空间不足且上方更大 → 向上弹出（输入区在窗口底部时的常态）
    const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
    setPos({
      left,
      width,
      maxHeight: Math.max(120, Math.min(288, (openUp ? spaceAbove : spaceBelow) - gap)),
      top: openUp ? undefined : r.bottom + gap,
      bottom: openUp ? window.innerHeight - r.top + gap : undefined,
    });
    setMenuOpen(true);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onScroll = () => setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menuOpen]);

  return { menuOpen, setMenuOpen, pos, btnRef, menuRef, toggleMenu };
}
