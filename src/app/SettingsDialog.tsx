import { useEffect, useState } from "react";
import { appDataDir } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";
import { Database, Info, Keyboard, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettingsStore } from "../stores/settingsStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 设置页（M2 开放 LLM 配置；当前为骨架：快捷键说明 + 数据位置 + 版本）。 */
export function SettingsDialog({ open, onClose }: Props) {
  const { llm } = useSettingsStore();
  const [dbPath, setDbPath] = useState("");
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (!open) return;
    void appDataDir()
      .then((p) => setDbPath(p))
      .catch(() => setDbPath("未知"));
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, [open]);

  const modKey = navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription className="sr-only">应用设置</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-1 text-sm">
          {/* LLM 配置（M2 开放） */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <KeyRound className="size-3.5" /> LLM 接入
              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300">
                M2
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">API Base URL</Label>
                <Input disabled value={llm.baseUrl} placeholder="https://api.openai.com/v1" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">模型</Label>
                <Input disabled value={llm.chatModel} placeholder="gpt-4o-mini" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              M2 里程碑开放：key 经系统钥匙串保存，支持任意 OpenAI 兼容端点。
            </p>
          </section>

          {/* 快捷键 */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Keyboard className="size-3.5" /> 快捷键
            </div>
            <div className="flex flex-col gap-1 text-xs">
              {[
                [`${modKey}+N`, "新建事件"],
                [`${modKey}+1 / ${modKey}+2`, "切换 周 / 月 视图"],
                [`${modKey}+T`, "回到今天"],
                [`${modKey}+,`, "打开设置"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-lg bg-white/4 px-2.5 py-1.5"
                >
                  <span className="text-foreground/75">{v}</span>
                  <kbd className="rounded-md border border-white/10 bg-white/6 px-1.5 py-0.5 font-mono text-[10px] text-indigo-200">
                    {k}
                  </kbd>
                </div>
              ))}
            </div>
          </section>

          {/* 数据 */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Database className="size-3.5" /> 数据
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-white/4 px-2.5 py-1.5">
                <span className="shrink-0 text-foreground/75">数据库目录</span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {dbPath || "…"}
                </span>
              </div>
              <div className="rounded-lg bg-white/4 px-2.5 py-1.5 text-muted-foreground/70">
                备份 = 复制该目录下的 riliagent.db（单文件，纯本地）
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/4 px-2.5 py-1.5">
                <span className="text-foreground/75">版本</span>
                <span className="font-mono text-[10px] text-muted-foreground">{version || "…"}</span>
              </div>
            </div>
          </section>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <Info className="size-3" /> 纯本地 · 单用户 · 无服务器端
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
