import { useEffect, useMemo, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { commands } from "../kernel/commands";
import { useUiStore } from "../stores/uiStore";
import { useChatStore } from "../stores/chatStore";

/** Cmd+K 命令栏：注册表命令 + 自由输入直接发给 Agent。 */
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const [query, setQuery] = useState("");
  const chatSend = useChatStore((s) => s.send);
  const chatSetOpen = useChatStore((s) => s.setOpen);

  const items = useMemo(() => commands.search(query), [query]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const sendToAgent = () => {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    chatSetOpen(true);
    useChatStore.getState().setView("chat"); // 强制回到对话视图，避免发在历史视图看不到
    chatSend(q);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="输入命令，或直接对 AI 说…（如「明天下午 3 点和老王开会 1 小时」）"
        value={query}
        onValueChange={setQuery}
        onKeyDown={(e) => {
          if (e.key === "Enter" && items.length === 0) {
            e.preventDefault();
            sendToAgent();
          }
        }}
      />
      <CommandList>
        <CommandEmpty>
          <button
            onClick={sendToAgent}
            className="w-full px-3 py-2 text-left text-sm text-indigo-300 transition hover:bg-white/6"
          >
            ⏎ 发送给 AI：「{query}」
          </button>
        </CommandEmpty>
        <CommandGroup heading="命令">
          {items.map((c) => (
            <CommandItem
              key={c.id}
              value={`cmd-${c.id}`}
              onSelect={() => {
                setOpen(false);
                void c.run();
              }}
            >
              {c.title}
            </CommandItem>
          ))}
        </CommandGroup>
        {items.length > 0 && query.trim() !== "" && (
          <>
            <CommandSeparator />
            <CommandGroup heading="发给 AI">
              <CommandItem value={`send-${query}`} onSelect={sendToAgent}>
                发送给 AI：「{query}」
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
