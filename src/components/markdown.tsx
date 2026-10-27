import { memo, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "../lib/utils";

/** 代码块：语言标签 + 复制按钮 + 横向滚动（DSH CodeBlock 简化版）。 */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // WebView2 剪贴板不可用时静默
    }
  };
  return (
    <div className="group/code my-2 overflow-hidden rounded-xl border border-white/8" style={{ background: "var(--code-bg, #0d0f16)" }}>
      <div className="flex items-center justify-between border-b border-white/6 bg-white/3 px-2.5 py-1">
        <span className="font-mono text-ui-10 text-muted-foreground/60">{lang || "code"}</span>
        <button
          onClick={() => void copy()}
          title="复制代码"
          className={cn(
            "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-ui-10 transition",
            copied ? "text-emerald-400" : "text-muted-foreground/60 hover:bg-white/8 hover:text-foreground",
          )}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="max-h-80 overflow-x-auto overflow-y-auto p-2.5 text-ui-11 leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) void openUrl(href).catch(() => undefined);
      }}
      className="text-indigo-300 underline decoration-indigo-300/40 underline-offset-2 transition hover:text-indigo-200"
    >
      {children}
    </a>
  ),
  p: ({ children }) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h1 className="mb-1 mt-2 text-base font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1 mt-2 text-ui-15 font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-1.5 text-sm font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-0.5 mt-1.5 text-sm font-medium first:mt-0">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-foreground/85">{children}</em>,
  hr: () => <hr className="my-2.5 border-white/8" />,
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-indigo-400/40 pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/4">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-white/8 px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-white/8 px-2 py-1">{children}</td>,
  code: ({ className, children }) => {
    const text = String(children).replace(/\n$/, "");
    const match = /language-([\w-]+)/.exec(className ?? "");
    const isBlock = Boolean(match) || text.includes("\n");
    if (isBlock) return <CodeBlock code={text} lang={match?.[1]} />;
    return (
      <code className="rounded-md bg-white/8 px-1.5 py-0.5 font-mono text-[0.85em] text-indigo-200">
        {children}
      </code>
    );
  },
  // 块级代码由上面的 code 组件接管，pre 只做透传
  pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
};

/** Markdown 渲染（GFM：表格/删除线/任务列表；链接走系统浏览器；代码块可复制）。 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  );
});
