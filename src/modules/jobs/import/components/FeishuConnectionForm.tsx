import { useState } from "react";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import type { FeishuConnection } from "../types";

interface Props {
  connection: FeishuConnection | null;
  busy: boolean;
  redirectUri: string;
  scopes: string;
  onConnect: (appId: string, secret: string) => void;
  onDisconnect: () => void;
}

export function FeishuConnectionForm({ connection, busy, redirectUri, scopes, onConnect, onDisconnect }: Props) {
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  if (connection) return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 p-3 text-sm">
      <div><p>已连接 · {connection.userName}</p><p className="mt-1 text-xs text-muted-foreground">{connection.appId} · 凭据保存在本机系统凭据管理器</p></div>
      <Button variant="outline" size="sm" disabled={busy} onClick={onDisconnect}>断开连接</Button>
    </div>
  );
  return (
    <form className="space-y-3 rounded-xl border border-white/10 p-4" onSubmit={(event) => {
      event.preventDefault(); onConnect(appId, secret); setSecret("");
    }}>
      <p className="text-sm font-medium">使用自己的飞书应用连接</p>
      <p className="text-xs leading-relaxed text-muted-foreground">在飞书开放平台为应用开通下列用户只读权限，并配置重定向地址。随后在系统浏览器中完成授权，RiLL 会自动接收本机回调。</p>
      <div className="space-y-1 break-all rounded-lg bg-white/5 p-2 text-xs">
        <p>重定向地址：<code className="select-all">{redirectUri}</code></p>
        <p>用户权限：<code className="select-all">{scopes}</code></p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">App ID<Input autoComplete="off" value={appId} onChange={(e) => setAppId(e.target.value)} disabled={busy} placeholder="cli_…" required /></label>
        <label className="space-y-1 text-xs">App Secret<Input type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} disabled={busy} required /></label>
      </div>
      <p className="text-xs text-muted-foreground">App Secret 和刷新令牌仅存系统凭据管理器，不进入投递数据库或 AI 请求。</p>
      <Button type="submit" size="sm" disabled={busy || !appId.trim() || !secret.trim()}>连接飞书</Button>
    </form>
  );
}
