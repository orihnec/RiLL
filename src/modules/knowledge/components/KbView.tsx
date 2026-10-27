import { useEffect, useState } from "react";
import { FolderOpen, FileText, FileUp, Loader2, Pencil, RefreshCw, Save, Eye, Folder } from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { importFileToKb } from "../import";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { Button } from "../../../components/ui/button";
import { useKbStore } from "../../../stores/kbStore";
import { useUiStore } from "../../../stores/uiStore";
import { Markdown } from "../../../components/markdown";
import { cn } from "../../../lib/utils";

const editorTypography = EditorView.theme({
  "&": { fontSize: "calc(14px * var(--font-scale))" },
});

/** 文档树：路径 + 索引状态角标。 */
function DocTree() {
  const docs = useKbStore((s) => s.docs);
  const selected = useKbStore((s) => s.selected);
  const selectDoc = useKbStore((s) => s.selectDoc);
  const indexing = useKbStore((s) => s.indexing);

  if (docs.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground/60">
        <FileText className="size-5 opacity-50" />
        {indexing ? "正在索引…" : "还没有文档，点「立即索引」扫描文件夹"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {docs.map((d) => {
        const active = d.path === selected;
        return (
          <button
            key={d.path}
            onClick={() => void selectDoc(d.path)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-ui-11 transition",
              active
                ? "bg-indigo-400/15 text-indigo-200"
                : "text-foreground/75 hover:bg-white/6 hover:text-foreground",
            )}
            title={d.path}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                d.index_status === "indexed"
                  ? "bg-emerald-400"
                  : d.index_status === "error"
                    ? "bg-red-400"
                    : "bg-amber-400",
              )}
            />
            <span className="truncate">{d.title}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 文档预览 / 编辑（CodeMirror）+ 保存。 */
function DocPane() {
  const selected = useKbStore((s) => s.selected);
  const drafts = useKbStore((s) => s.drafts);
  const saveDoc = useKbStore((s) => s.saveDoc);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [saved, setSaved] = useState(false);
  const content = selected ? (drafts[selected] ?? "") : "";

  useEffect(() => setMode("preview"), [selected]);

  const save = async () => {
    if (!selected) return;
    await saveDoc(selected, content);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground/60">
        <Folder className="size-6 opacity-50" />
        从左侧选择一篇文档
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b border-white/6 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-ui-10 text-muted-foreground/70">
          {selected}
        </span>
        <button
          onClick={() => setMode("preview")}
          className={cn(
            "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-ui-10 transition",
            mode === "preview"
              ? "bg-indigo-400/15 text-indigo-200"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Eye className="size-3" /> 预览
        </button>
        <button
          onClick={() => setMode("edit")}
          className={cn(
            "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-ui-10 transition",
            mode === "edit"
              ? "bg-indigo-400/15 text-indigo-200"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Pencil className="size-3" /> 编辑
        </button>
        {mode === "edit" && (
          <Button size="sm" variant="outline" onClick={() => void save()} className="h-6 px-2 text-ui-10">
            {saved ? "已保存" : <><Save className="size-3" /> 保存并索引</>}
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        {mode === "preview" ? (
          <Markdown text={content} />
        ) : (
          <div className="-m-1 h-full overflow-hidden rounded-lg border border-white/8">
            <CodeMirror
              value={content}
              height="100%"
              theme={oneDark}
              extensions={[markdown(), editorTypography]}
              onChange={(v) => useKbStore.setState((s) => ({ drafts: { ...s.drafts, [selected]: v } }))}
              basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** 知识库（一级页面）：文件夹选择 + 文档树 + Markdown 预览/编辑 + 索引状态 + 30s 轮询。 */
export function KbView() {
  const setOpen = useKbStore((s) => s.setOpen);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const rootPath = useKbStore((s) => s.rootPath);
  const indexing = useKbStore((s) => s.indexing);
  const indexMsg = useKbStore((s) => s.indexMsg);
  const lastIndexAt = useKbStore((s) => s.lastIndexAt);
  const pickFolder = useKbStore((s) => s.pickFolder);
  const scan = useKbStore((s) => s.scan);
  const load = useKbStore((s) => s.load);

  // 挂载即"打开"：加载状态 + 30s 轮询增量索引
  useEffect(() => {
    setOpen(true);
    void load();
    const t = setInterval(() => void scan(true), 30_000);
    return () => {
      clearInterval(t);
      setOpen(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 导入外部文件（PDF/Word/文本）→ 抽正文写成 .md → 立即索引 */
  const importFiles = async () => {
    if (!rootPath || importing) return;
    const picked = await openFileDialog({
      multiple: true,
      title: "导入到知识库",
      filters: [
        { name: "文档", extensions: ["pdf", "docx"] },
        { name: "文本", extensions: ["txt", "md", "csv", "json"] },
      ],
    });
    if (!picked) return;
    const list = Array.isArray(picked) ? picked : [picked];
    setImporting(true);
    setImportMsg(null);
    const done: string[] = [];
    try {
      for (const p of list) {
        const target = await importFileToKb(rootPath, p);
        done.push(target.split(/[\\/]/).pop() ?? target);
      }
      setImportMsg(`已导入 ${done.length} 个文件：${done.join("、")}`);
      await scan();
    } catch (e) {
      setImportMsg(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="glass flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-3xl p-3">
      <div className="flex shrink-0 items-center gap-2">
        <Folder className="size-4 text-indigo-300" />
        <span className="text-sm font-semibold">知识库</span>
        <span className="text-ui-10 text-muted-foreground/60">本地 Markdown · 增量索引 · 混合检索</span>
        <button
          onClick={() => useUiStore.getState().setAppView("calendar")}
          className="ml-auto rounded-lg px-2 py-1 text-ui-11 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
        >
          回到日历
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
          {/* 左：文件夹 + 文档树 */}
          <div className="flex w-60 shrink-0 flex-col gap-2">
            <div className="flex flex-col gap-1.5 rounded-xl border border-white/8 bg-white/3 p-2">
              <div className="flex items-center gap-1.5 text-ui-11 text-muted-foreground">
                <FolderOpen className="size-3 shrink-0" />
                <span className="truncate" title={rootPath ?? undefined}>
                  {rootPath ?? "未选择文件夹"}
                </span>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void pickFolder()}
                  className="h-7 flex-1 text-ui-11"
                >
                  <FolderOpen className="size-3" /> 选择文件夹
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void importFiles()}
                  disabled={!rootPath || importing}
                  className="h-7 flex-1 text-ui-11"
                  title="导入 PDF / Word / 文本：抽取正文写成 .md，再自动索引"
                >
                  {importing ? <Loader2 className="size-3 animate-spin" /> : <FileUp className="size-3" />}
                  导入文件
                </Button>
              </div>
              {importMsg && (
                <p className="truncate text-ui-10 text-indigo-300/80" title={importMsg}>
                  {importMsg}
                </p>
              )}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void scan()}
                  disabled={!rootPath || indexing}
                  className="h-7 flex-1 text-ui-11"
                >
                  {indexing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                  立即索引
                </Button>
              </div>
              {lastIndexAt && (
                <div className="text-ui-10 text-muted-foreground/60">
                  上次索引：{new Date(lastIndexAt).toLocaleTimeString("zh-CN")}
                </div>
              )}
              {indexMsg && (
                <div className="truncate text-ui-10 text-indigo-300/80" title={indexMsg}>
                  索引中：{indexMsg.split(/[\\/]/).pop()}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/8 bg-white/3 p-1.5">
              <DocTree />
            </div>
          </div>

          {/* 右：预览 / 编辑 */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/8 bg-white/3">
            <DocPane />
          </div>
        </div>
    </div>
  );
}
