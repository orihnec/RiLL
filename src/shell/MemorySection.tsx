import { useEffect, useState } from "react";
import {
  Brain,
  Check,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  listPreferences,
  listSkills,
  setPreferenceStatus,
  updatePreferenceContent,
  deletePreference,
  addPreference,
  deleteSkill,
  runReflection,
  distillSkills,
  countUnreflectedAgentEdits,
  type Preference,
  type Skill,
} from "../kernel/agent/memory";
import { cn } from "../lib/utils";

const STATUS_LABEL: Record<Preference["status"], string> = {
  pending: "待确认",
  active: "生效中",
  archived: "已归档",
};

const STATUS_DOT: Record<Preference["status"], string> = {
  pending: "bg-amber-400",
  active: "bg-emerald-400",
  archived: "bg-white/20",
};

/** 单条偏好：待确认 → 确认/删除；生效中 → 编辑/删除。 */
function PreferenceRow({ p, onChanged }: { p: Preference; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.content);
  const [confirmDel, setConfirmDel] = useState(false);

  const saveEdit = async () => {
    if (text.trim() && text.trim() !== p.content) {
      await updatePreferenceContent(p.id, text.trim());
      onChanged();
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg bg-white/4 px-2 py-1">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          className="h-7 flex-1 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveEdit();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => void saveEdit()}>
          <Check className="size-3.5 text-emerald-400" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => setEditing(false)}>
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 rounded-lg bg-white/4 px-2 py-1.5">
      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", STATUS_DOT[p.status])} />
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed text-foreground/85">{p.content}</p>
        <p className="mt-0.5 text-ui-10 text-muted-foreground/60">
          {STATUS_LABEL[p.status]} · 置信度 {(p.confidence * 100).toFixed(0)}%
          · {new Date(p.created_at).toLocaleDateString("zh-CN")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        {p.status === "pending" && (
          <button
            onClick={async () => {
              await setPreferenceStatus(p.id, "active");
              onChanged();
            }}
            title="确认生效（将注入 AI 提示词）"
            className="rounded-md p-1 text-emerald-400 transition hover:bg-emerald-400/15"
          >
            <CheckCircle2 className="size-3.5" />
          </button>
        )}
        {p.status !== "archived" && (
          <button
            onClick={() => {
              setEditing(true);
              setText(p.content);
            }}
            title="编辑"
            className="rounded-md p-1 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        <button
          onClick={async () => {
            if (confirmDel) {
              await deletePreference(p.id);
              onChanged();
            } else {
              setConfirmDel(true);
              setTimeout(() => setConfirmDel(false), 2500);
            }
          }}
          title="删除"
          className={cn(
            "rounded-md p-1 transition",
            confirmDel ? "bg-red-500/20 text-red-300" : "text-muted-foreground hover:bg-white/8 hover:text-red-300",
          )}
        >
          {confirmDel ? <span className="px-0.5 text-ui-10">确认？</span> : <Trash2 className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

/** 设置页「记忆与偏好」：反思触发 + 偏好确认/编辑/删除 + 技能沉淀。 */
export function MemorySection() {
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [editCount, setEditCount] = useState(0);
  const [reflecting, setReflecting] = useState(false);
  const [reflectingMsg, setReflectingMsg] = useState<string | null>(null);
  const [distilling, setDistilling] = useState(false);
  const [manualText, setManualText] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const refresh = async () => {
    const [p, s, n] = await Promise.all([listPreferences(), listSkills(), countUnreflectedAgentEdits()]);
    setPrefs(p);
    setSkills(s);
    setEditCount(n);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const reflect = async () => {
    setReflecting(true);
    setReflectingMsg(null);
    const r = await runReflection();
    setReflectingMsg(r.error ?? (r.created > 0 ? `已生成 ${r.created} 条偏好（待确认）` : "未发现新的偏好"));
    setReflecting(false);
    await refresh();
  };

  const distill = async () => {
    setDistilling(true);
    const r = await distillSkills();
    setReflectingMsg(r.created > 0 ? `已沉淀 ${r.created} 个新技能` : "暂无达到沉淀门槛的组合（≥3 次）");
    setDistilling(false);
    await refresh();
  };

  const visible = showArchived ? prefs : prefs.filter((p) => p.status !== "archived");
  const archivedCount = prefs.filter((p) => p.status === "archived").length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Brain className="size-3.5" /> 记忆与偏好
        <span className="text-ui-10 font-normal text-muted-foreground/50">
          自动学习你的日程习惯，注入 AI 提示词
        </span>
      </div>

      {/* 反思触发 */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/4 px-2.5 py-2">
        <Button size="sm" variant="outline" onClick={() => void reflect()} disabled={reflecting}>
          {reflecting ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
          {reflecting ? "反思中…" : "运行反思"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void distill()} disabled={distilling}>
          {distilling ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          技能沉淀
        </Button>
        <span className="text-ui-10 text-muted-foreground/60">
          手动修正 AI 安排 {editCount} 次（≥20 次自动触发反思）
        </span>
      </div>
      {reflectingMsg && <p className="text-ui-11 text-indigo-300/80">{reflectingMsg}</p>}

      {/* 偏好列表 */}
      {visible.length > 0 && (
        <div className="flex flex-col gap-1">
          {visible.map((p) => (
            <PreferenceRow key={p.id} p={p} onChanged={() => void refresh()} />
          ))}
        </div>
      )}
      {archivedCount > 0 && (
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="self-start text-ui-10 text-muted-foreground/50 transition hover:text-foreground"
        >
          {showArchived ? "隐藏" : "显示"}已归档（{archivedCount}）
        </button>
      )}

      {/* 手动添加偏好 */}
      {showAdd ? (
        <div className="flex items-center gap-1.5">
          <Input
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="例如：我的会议默认 30 分钟"
            autoFocus
            className="h-7 flex-1 text-xs"
            onKeyDown={async (e) => {
              if (e.key === "Enter" && manualText.trim()) {
                await addPreference(manualText, 0.5);
                setManualText("");
                setShowAdd(false);
                await refresh();
              }
            }}
          />
          <Button
            size="sm"
            className="h-7 px-2 text-ui-11"
            disabled={!manualText.trim()}
            onClick={async () => {
              await addPreference(manualText, 0.5);
              setManualText("");
              setShowAdd(false);
              await refresh();
            }}
          >
            添加
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="self-start text-ui-11 text-indigo-300/80 transition hover:text-indigo-200"
        >
          + 手动添加偏好
        </button>
      )}

      {/* 技能 */}
      {skills.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-ui-10 font-semibold text-muted-foreground/70">已沉淀技能</div>
          {skills.map((s) => (
            <div key={s.id} className="group flex items-center gap-2 rounded-lg bg-white/4 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-ui-11 text-indigo-200">{s.name}</p>
                <p className="truncate text-ui-10 text-muted-foreground/60">{s.description}</p>
              </div>
              <span className="shrink-0 text-ui-10 text-muted-foreground/50">{s.use_count} 次</span>
              <button
                onClick={async () => {
                  await deleteSkill(s.id);
                  await refresh();
                }}
                title="删除技能"
                className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-white/8 hover:text-red-300"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {prefs.length === 0 && skills.length === 0 && (
        <p className="text-ui-11 text-muted-foreground/50">
          暂无记忆。使用一段时间（尤其让 AI 安排日程后手动修正）再运行反思，会生成个性化偏好。
        </p>
      )}
    </section>
  );
}
