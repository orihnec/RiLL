import { Bell, BellOff, ChevronDown, ChevronRight, CloudDownload, Loader2, Pencil, Radar, Trash2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { avatarHue, initials } from "../format";
import type { MailWorkspace } from "../hooks/useMailWorkspace";
import { folderIcon } from "./folderIcon";

/** 第一栏：账号（可折叠）+ 文件夹树 + 未读徽标 + 实时接收状态点。 */
export function AccountRail({ ws }: { ws: MailWorkspace }) {
  const {
    accounts,
    folders,
    expanded,
    setExpanded,
    activeAccountId,
    setActiveAccountId,
    activeFolderId,
    setActiveFolderId,
    setThread,
    setMessages,
    watch,
    busy,
    syncOne,
    accountMenu,
  } = ws;

  return (
    <div className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-white/6 py-1.5">
      {accounts.length === 0 && (
        <p className="px-3 py-6 text-center text-ui-11 leading-relaxed text-muted-foreground/50">
          还没有邮箱
          <br />
          点右上角「添加邮箱」接入 QQ / 163 / 企业邮箱
        </p>
      )}
      {accounts.map((a) => {
        const list = folders[a.id] ?? [];
        const isOpen = expanded[a.id] !== false;
        const unread = list.filter((f) => f.special === "inbox").reduce((n, f) => n + f.unread, 0);
        return (
          <div key={a.id} className="px-1.5">
            <div
              onClick={() => {
                setActiveAccountId(a.id);
                setExpanded((prev) => ({ ...prev, [a.id]: !isOpen }));
              }}
              onContextMenu={(e) =>
                accountMenu(e, a, {
                  sync: <CloudDownload className="size-3.5" />,
                  bell: <Bell className="size-3.5" />,
                  bellOff: <BellOff className="size-3.5" />,
                  radar: <Radar className="size-3.5" />,
                  edit: <Pencil className="size-3.5" />,
                  trash: <Trash2 className="size-3.5" />,
                })
              }
              className={cn(
                "group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition",
                a.id === activeAccountId
                  ? "bg-white/6 text-foreground"
                  : "text-muted-foreground hover:bg-white/4",
              )}
              title={`${a.email}${a.lastError ? ` · 上次出错：${a.lastError}` : ""}`}
            >
              {isOpen ? (
                <ChevronDown className="size-3 shrink-0" />
              ) : (
                <ChevronRight className="size-3 shrink-0" />
              )}
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-md text-ui-9 font-medium text-white/90"
                style={{ background: `hsl(${avatarHue(a.email)} 45% 42%)` }}
              >
                {initials(a.displayName ?? "", a.email)}
              </span>
              <span className="min-w-0 flex-1 truncate">{a.displayName || a.email}</span>
              {a.notify && (
                <span
                  title={
                    watch[a.id]
                      ? `${watch[a.id].mode === "idle" ? "服务器推送（IDLE）" : `每 ${a.watchInterval} 秒查询一次`}${
                          watch[a.id].message ? ` · ${watch[a.id].message}` : ""
                        }`
                      : "实时接收启动中…"
                  }
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    !watch[a.id]
                      ? "bg-muted-foreground/40"
                      : watch[a.id].status === "ok"
                        ? "bg-emerald-400"
                        : watch[a.id].status === "error"
                          ? "bg-amber-400"
                          : "bg-red-400",
                  )}
                />
              )}
              {a.lastError && <span className="size-1.5 shrink-0 rounded-full bg-red-400" />}
              {busy === a.id ? (
                <Loader2 className="size-3 shrink-0 animate-spin" />
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void syncOne(a.id);
                  }}
                  title="同步此邮箱"
                  className="hidden shrink-0 rounded p-0.5 hover:bg-white/10 group-hover:block"
                >
                  <CloudDownload className="size-3" />
                </button>
              )}
              {unread > 0 && (
                <span className="shrink-0 rounded-full bg-indigo-400/20 px-1.5 text-ui-10 tabular-nums text-indigo-200">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </div>
            {isOpen &&
              list.map((f) => {
                const active = f.id === activeFolderId;
                return (
                  <div
                    key={f.id}
                    onClick={() => {
                      setActiveAccountId(a.id);
                      setActiveFolderId(f.id);
                      setThread(null);
                      setMessages([]);
                    }}
                    onDoubleClick={() => void syncOne(a.id, f)}
                    title={`${f.name}（双击同步此文件夹）`}
                    className={cn(
                      "ml-4 flex cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pl-3 pr-2 text-ui-11 transition",
                      active
                        ? "bg-indigo-400/12 text-indigo-100"
                        : "text-muted-foreground hover:bg-white/4 hover:text-foreground",
                    )}
                  >
                    <span className="shrink-0 text-muted-foreground/70">{folderIcon(f.special)}</span>
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    {f.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-indigo-400/18 px-1.5 text-ui-10 tabular-nums text-indigo-200">
                        {f.unread > 99 ? "99+" : f.unread}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
