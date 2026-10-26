import { useEffect, useRef, useState } from "react";
import { errMsg } from "../../../lib/error";
import { ArrowUp, FileText, Loader2, Paperclip, Square, X } from "lucide-react";
import { ModelPicker } from "./ModelPicker";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { useChatStore } from "../../../stores/chatStore";
import { parseAttachmentFile, ATTACHMENT_FILTERS } from "../../../lib/attachment";
import { useThemeStore } from "../../../stores/themeStore";

/**
 * 输入区：胶囊卡片（textarea 自动增高 + 附件 chips + 模型选择 + 发送/停止）。
 * IME 组合态的回车不发送（中文选候选字）。
 */
export function Composer({ open, configured }: { open: boolean; configured: boolean }) {
  const fontSize = useThemeStore((s) => s.fontSize);
  const status = useChatStore((s) => s.status);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const attachments = useChatStore((s) => s.attachments);
  const addAttachment = useChatStore((s) => s.addAttachment);
  const removeAttachment = useChatStore((s) => s.removeAttachment);

  const [input, setInput] = useState("");
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // IME 组合态守卫：选候选字时的回车不是发送
  const composingRef = useRef(false);

  // 输入框自动增高（scrollHeight 驱动，上限 160px 内滚）
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input, open, fontSize]);

  /** 选择并解析文件（.xlsx/.docx/文本），随下一条消息发送。 */
  const pickFiles = async () => {
    if (attachBusy || status === "streaming") return;
    const picked = await openFileDialog({
      multiple: true,
      filters: ATTACHMENT_FILTERS,
      title: "选择要上传的文件",
    });
    if (!picked) return;
    const list = Array.isArray(picked) ? picked : [picked];
    setAttachBusy(true);
    setAttachError(null);
    try {
      for (const p of list) addAttachment(await parseAttachmentFile(p));
    } catch (e) {
      setAttachError(errMsg(e));
    } finally {
      setAttachBusy(false);
    }
  };

  const submit = () => {
    const t = input.trim();
    if ((!t && attachments.length === 0) || status === "streaming") return;
    setInput("");
    send(t);
  };

  return (
    <div className="border-t border-white/6 p-3 pt-2">
      <div className="rounded-2xl border border-white/10 bg-white/4 shadow-lg transition focus-within:border-indigo-400/40 focus-within:bg-white/5">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-2.5 pt-2">
            {attachments.map((a, i) => (
              <span
                key={`${a.name}-${i}`}
                className="flex max-w-[240px] items-center gap-1 rounded-md bg-white/6 px-1.5 py-0.5 text-ui-10 text-foreground/70"
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{a.name}</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="shrink-0 rounded p-0.5 text-indigo-200/60 transition hover:bg-white/10 hover:text-indigo-100"
                  title="移除附件"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            if (composingRef.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) {
              return;
            }
            e.preventDefault();
            submit();
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            setTimeout(() => {
              composingRef.current = false;
            }, 10);
          }}
          rows={1}
          placeholder={configured ? "问点什么，或直接说安排日程…" : "演示：创建 / 查询 / 找空闲"}
          className="max-h-40 w-full resize-none overflow-y-auto bg-transparent px-3 pb-1 pt-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
        />

        {attachError && (
          <p className="px-3 text-ui-10 text-red-400" title={attachError}>
            {attachError}
          </p>
        )}

        <div className="flex items-center gap-1.5 px-1.5 pb-1.5">
          <button
            onClick={() => void pickFiles()}
            disabled={attachBusy || status === "streaming"}
            title="附加文件（PDF / Word / Excel / 文本）"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/8 hover:text-foreground disabled:opacity-40"
          >
            {attachBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
          </button>
          {/* 模型选择：紧凑胶囊，贴着附件按钮；右侧留给发送 */}
          <ModelPicker open={open} streaming={status === "streaming"} />
          <span className="flex-1" />
          {status === "streaming" ? (
            <button
              onClick={stop}
              title="停止"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white transition hover:bg-indigo-400"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!input.trim() && attachments.length === 0}
              title="发送（Enter）"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white transition hover:bg-indigo-400 disabled:opacity-30"
            >
              <ArrowUp className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
