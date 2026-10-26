import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FONT_SCALES } from "../../../lib/typography";
import { useThemeStore } from "../../../stores/themeStore";

interface OriginalFont {
  element: HTMLElement;
  size: number;
  lineHeight: number;
}

/** iframe 不继承应用样式，按邮件原始字号缩放，保留标题与正文的大小关系。 */
export function useMailFrame() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const originalFonts = useRef<OriginalFont[]>([]);
  const observer = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState(320);
  const fontSize = useThemeStore((s) => s.fontSize);

  const measure = useCallback(() => {
    const body = frameRef.current?.contentDocument?.body;
    if (body) setHeight(Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height)) + 16);
  }, []);

  const applySize = useCallback(() => {
    const scale = FONT_SCALES[fontSize];
    for (const { element, size, lineHeight } of originalFonts.current) {
      element.style.setProperty("font-size", `${size * scale}px`, "important");
      if (Number.isFinite(lineHeight)) {
        element.style.setProperty("line-height", `${lineHeight * scale}px`, "important");
      }
    }
    measure();
  }, [fontSize, measure]);

  const onLoad = useCallback(() => {
    observer.current?.disconnect();
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body || !doc.defaultView) return;
    const view = doc.defaultView;
    // 先读完整棵树再写，避免父元素变大后子元素又被重复放大。
    originalFonts.current = [doc.body, ...doc.body.querySelectorAll<HTMLElement>("*")]
      .filter((element) => element.tagName !== "STYLE")
      .map((element) => {
        const style = view.getComputedStyle(element);
        return { element, size: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) };
      });
    applySize();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(doc.body);
  }, [applySize, measure]);

  useLayoutEffect(applySize, [applySize]);
  useEffect(() => () => observer.current?.disconnect(), []);

  return { frameRef, height, onLoad };
}
