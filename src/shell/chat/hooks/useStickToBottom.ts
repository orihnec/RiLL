import { useEffect, useRef, useState } from "react";
import type { ChatMsg } from "../../../kernel/agent/types";

/**
 * 滚动跟随：只有用户钉在底部时才自动跟随（向上翻阅历史不会被流式内容拽走）。
 * 新一轮发送（进入 streaming）强制回到底部。
 */
export function useStickToBottom({
  messages,
  status,
  open,
  view,
}: {
  messages: ChatMsg[];
  status: string;
  open: boolean;
  view: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const prevStatusRef = useRef(status);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // 新一轮开始时强制回到底部（用户刚发送消息）
    if (status === "streaming" && prevStatusRef.current !== "streaming") pinnedRef.current = true;
    prevStatusRef.current = status;
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, status, open, view]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    pinnedRef.current = near;
    setAtBottom(near);
  };

  const jumpToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setAtBottom(true);
  };

  return { listRef, atBottom, onScroll, jumpToBottom };
}
