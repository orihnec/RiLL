import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { CATEGORY_PALETTE } from "../../lib/colors";

/**
 * 通用颜色选择器：色板点选即时生效；自选颜色在关闭弹层时提交。
 * 类别管理 / 求职状态管理共用。
 */
export function ColorPicker({
  value,
  onChange,
  title = "点选调整颜色",
}: {
  value: string;
  onChange: (color: string) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commit = (hex: string) => {
    setDraft(hex);
    onChange(hex);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && draft !== value) onChange(draft);
      }}
    >
      <PopoverTrigger asChild>
        <button
          className="size-6 shrink-0 rounded-full border border-white/20 shadow-sm transition hover:scale-110"
          style={{ background: value }}
          title={title}
          aria-label={title}
        />
      </PopoverTrigger>
      <PopoverContent className="z-[60] w-52 p-2">
        <div className="grid grid-cols-4 gap-1.5">
          {CATEGORY_PALETTE.map((hex) => (
            <button
              key={hex}
              onClick={() => commit(hex)}
              className="flex size-8 items-center justify-center rounded-md border border-white/10 transition hover:scale-105"
              style={{ background: hex }}
              aria-label={hex}
            >
              {hex === value && <Check className="size-3 text-white" />}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-ui-10 text-muted-foreground">
          自选
          <input
            type="color"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent"
          />
          <span className="font-mono">{draft}</span>
        </label>
      </PopoverContent>
    </Popover>
  );
}
