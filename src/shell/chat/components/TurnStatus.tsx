import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fmtDuration } from "../format";

/** 等待首 token 的运行状态：超过 15s 追加耗时时钟。 */
export function TurnStatus() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="flex items-center gap-1.5" role="status">
      <Loader2 className="size-2.5 animate-spin text-indigo-300/70" />
      <span>开始思考…</span>
      {elapsed >= 15_000 && (
        <span className="font-mono text-[10px] text-muted-foreground/40">{fmtDuration(elapsed)}</span>
      )}
    </span>
  );
}
