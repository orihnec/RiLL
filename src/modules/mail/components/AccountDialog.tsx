import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import { MAIL_PRESETS, addAccount, presetOf, updateAccount, type MailAccount } from "../service";
import { errText } from "../format";

/**
 * 添加 / 编辑邮箱。
 * 授权码只进 Windows 凭据管理器（与 LLM key 同待遇），绝不入库。
 */
export function AccountDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: MailAccount | null;
  onClose: () => void;
  onSaved: (accountId?: string) => void;
}) {
  const [presetId, setPresetId] = useState("qq");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(993);
  const [security, setSecurity] = useState("ssl");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [syncDays, setSyncDays] = useState(30);
  const [notify, setNotify] = useState(true);
  const [notifyInterval, setNotifyInterval] = useState(15);
  const [watchInterval, setWatchInterval] = useState(20);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 打开时：编辑 → 回填；新增 → 套 QQ 预设
  useEffect(() => {
    if (editing) {
      setPresetId("custom");
      setEmail(editing.email);
      setUsername(editing.username);
      setHost(editing.host);
      setPort(editing.port);
      setSecurity(editing.security);
      setDisplayName(editing.displayName ?? "");
      setSyncDays(editing.syncDays);
      setNotify(editing.notify);
      setNotifyInterval(editing.notifyInterval);
      setWatchInterval(editing.watchInterval);
      setPassword("");
    } else {
      setPresetId("qq");
      const p = presetOf("qq");
      setEmail("");
      setUsername("");
      setHost(p.host);
      setPort(p.port);
      setSecurity(p.security);
      setDisplayName("");
      setSyncDays(30);
      setNotify(true);
      setNotifyInterval(15);
      setWatchInterval(20);
      setPassword("");
    }
    setProbe(null);
    setError(null);
  }, [editing, open]);

  const pickPreset = (id: string) => {
    setPresetId(id);
    const p = presetOf(id);
    setHost(p.host);
    setPort(p.port);
    setSecurity(p.security);
    setProbe(null);
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    setProbe(null);
    try {
      const { testConnection } = await import("../service");
      const res = await testConnection({
        host: host.trim(),
        port,
        security,
        username: (username || email).trim(),
        password: password.trim(),
      });
      setProbe(
        `连接成功：${res.folders.length} 个文件夹（${res.folders
          .slice(0, 4)
          .map((f) => f.name)
          .join("、")}${res.folders.length > 4 ? "…" : ""}）· 收件箱 ${res.inboxExists} 封 / 未读 ${res.inboxUnseen}`,
      );
    } catch (e) {
      setError(errText(e));
    } finally {
      setTesting(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await updateAccount(
          editing.id,
          { displayName: displayName.trim() || undefined, syncDays, notify, notifyInterval, watchInterval },
          password.trim() || undefined,
        );
        onSaved();
      } else {
        const acc = await addAccount({
          presetId,
          email: email.trim(),
          username: username.trim() || undefined,
          displayName: displayName.trim() || undefined,
          host: host.trim(),
          port,
          security,
          password: password.trim(),
          syncDays,
          notify,
          notifyInterval,
          watchInterval,
        });
        onSaved(acc.id);
      }
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{editing ? "编辑邮箱" : "添加邮箱"}</DialogTitle>
          <DialogDescription className="text-[11px]">
            QQ / 163 / 126 等要用**授权码**，不是登录密码；授权码只存进 Windows 凭据管理器，不入库。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {!editing && (
            <div className="flex flex-wrap gap-1.5">
              {MAIL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pickPreset(p.id)}
                  className={cn(
                    "rounded-lg border px-2 py-1 text-[11px] transition",
                    presetId === p.id
                      ? "border-indigo-400/50 bg-indigo-400/12 text-indigo-200"
                      : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">邮箱地址</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@163.com"
                disabled={!!editing}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">IMAP 服务器</Label>
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.163.com" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">端口 / 加密</Label>
              <div className="flex gap-1.5">
                <Input
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value.replace(/\D/g, "")) || 993)}
                  className="w-20"
                />
                <select
                  value={security}
                  onChange={(e) => setSecurity(e.target.value)}
                  className="flex-1 rounded-md border border-white/10 bg-white/4 px-2 text-xs outline-none"
                >
                  <option value="ssl" className="bg-popover">
                    SSL（推荐）
                  </option>
                  <option value="starttls" className="bg-popover">
                    STARTTLS
                  </option>
                </select>
              </div>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">登录账号{editing ? "（一般与邮箱地址相同）" : ""}</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={email || "you@163.com"}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">{editing ? "新授权码（留空表示不改）" : "授权码 / 密码"}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? "••••••（不改就留空）" : "在邮箱网页版设置里生成"}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">显示名（可留空）</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如：163 主邮箱"
              />
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">首次同步回溯天数</Label>
              <Input
                value={syncDays}
                onChange={(e) => setSyncDays(Number(e.target.value.replace(/\D/g, "")) || 30)}
                className="w-24"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label className="text-xs">实时接收新邮件</Label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNotify((v) => !v)}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[11px] transition",
                    notify
                      ? "border-indigo-400/50 bg-indigo-400/12 text-indigo-200"
                      : "border-white/8 bg-white/3 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {notify ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
                  {notify ? "开启" : "关闭"}
                </button>
                <select
                  value={watchInterval}
                  onChange={(e) => setWatchInterval(Number(e.target.value))}
                  disabled={!notify}
                  className="h-9 flex-1 rounded-md border border-white/10 bg-white/4 px-2 text-xs outline-none disabled:opacity-50"
                  title="服务器不支持 IDLE 推送时，按这个间隔查询新邮件（STATUS 只要 ~20ms，很轻）"
                >
                  {[10, 20, 30, 60, 120].map((s) => (
                    <option key={s} value={s} className="bg-popover">
                      每 {s} 秒查询一次
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground/45">
            监听在后台常驻线程里跑（不是网页定时器，最小化到托盘也照样收）：服务器支持 <b>IDLE</b> 就由服务器主动推送
            （QQ / Gmail 支持）；不支持就按上面的间隔查询 —— <b>163 实测不支持 IDLE</b>，但它家的
            `STATUS` 只要 ~20ms，20 秒一次已经非常接近实时。有新邮件会弹 Windows 通知，点通知直接打开邮箱面板。
          </p>

          {probe && (
            <p className="rounded-lg border border-emerald-400/25 bg-emerald-400/8 px-2.5 py-1.5 text-[11px] text-emerald-200">
              {probe}
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-red-200">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void test()}
              disabled={testing || !host || !password}
            >
              {testing && <Loader2 className="size-3 animate-spin" />}
              测试连接
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                取消
              </Button>
              <Button size="sm" onClick={() => void submit()} disabled={busy || !email || (!editing && !password)}>
                {busy && <Loader2 className="size-3 animate-spin" />}
                {editing ? "保存" : "添加并同步"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
